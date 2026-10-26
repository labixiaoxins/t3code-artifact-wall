import { assert, it } from "@effect/vitest";
import {
  CommandId,
  EventId,
  MessageId,
  TurnItemId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import { buildBoundedThreadProjection } from "./threadHistoryPaging.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

const instanceId = ProviderInstanceId.make("codex");
const adapter = {
  instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("Archive tests must never start a provider"),
} as ProviderAdapter.ProviderAdapterV2["Service"];
const database = SqlitePersistence.layerMemory;
const layer = Layer.mergeAll(
  database,
  ProjectionStore.layer.pipe(Layer.provide(database)),
  ProviderReplayHarness.layerWithRegistry(
    { name: "archive-safety" },
    ProviderAdapterRegistry.layerFromAdapters([adapter]),
    { databaseLayer: database, runEffectWorker: false },
  ),
);
const root = ThreadId.make("archive:original");
const create = Effect.gen(function* () {
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  yield* orchestrator.dispatch({
    type: "thread.create",
    commandId: CommandId.make("create-original"),
    threadId: root,
    projectId: ProjectId.make("archive:project"),
    title: "原会话",
    modelSelection: { instanceId, model: "gpt-6" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    createdBy: "user",
    creationSource: "web",
  });
});
const reject = (id: string, reason: Orchestrator.OrchestratorArchiveBlockedError["reason"]) =>
  Effect.gen(function* () {
    const orchestrator = yield* Orchestrator.OrchestratorV2;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    const result = yield* Effect.result(
      orchestrator.dispatch({
        type: "thread.archive",
        commandId: CommandId.make(`archive:${id}`),
        threadId: root,
        requireIdle: true,
      }),
    );
    assert.ok(Result.isFailure(result));
    assert.ok(Schema.is(Orchestrator.OrchestratorArchiveBlockedError)(result.failure));
    assert.equal(result.failure.reason, reason);
    assert.isNull((yield* projections.getThread(root)).archivedAt);
  });

it.effect("checks every active run status at dispatch, leaving the run and thread unchanged", () =>
  Effect.gen(function* () {
    yield* create;
    const sql = yield* SqlClient.SqlClient;
    for (const status of ["preparing", "queued", "starting", "running", "waiting"]) {
      yield* sql`INSERT INTO orchestration_v2_projection_runs
      (run_id, thread_id, ordinal, provider, status, requested_at, payload_json)
      VALUES (${status}, ${root}, 1, 'codex', ${status}, '2026-10-19T00:00:00Z', '{}')`;
      yield* reject(status, "active-run");
      assert.equal(
        (yield* sql<{ status: string }>`SELECT status FROM orchestration_v2_projection_runs`)[0]
          ?.status,
        status,
      );
      yield* sql`DELETE FROM orchestration_v2_projection_runs`;
    }
  }).pipe(Effect.provide(layer)),
);

it.effect("blocks pending approvals and user input without resolving them", () =>
  Effect.gen(function* () {
    yield* create;
    const sql = yield* SqlClient.SqlClient;
    for (const kind of ["approval", "user_input"]) {
      yield* sql`INSERT INTO orchestration_v2_projection_runtime_requests
      (runtime_request_id, thread_id, node_id, kind, status, created_at, payload_json)
      VALUES (${kind}, ${root}, 'node', ${kind}, 'pending', '2026-10-19T00:00:00Z', '{}')`;
      yield* reject(kind, "pending-request");
      assert.equal(
        (yield* sql<{
          status: string;
        }>`SELECT status FROM orchestration_v2_projection_runtime_requests`)[0]?.status,
        "pending",
      );
      yield* sql`DELETE FROM orchestration_v2_projection_runtime_requests`;
    }
  }).pipe(Effect.provide(layer)),
);

it.effect("checks enabled bound schedules without decoding prompts or pausing or rebinding", () =>
  Effect.gen(function* () {
    yield* create;
    const sql = yield* SqlClient.SqlClient;
    const projections = yield* ProjectionStore.ProjectionStoreV2;
    yield* sql`INSERT INTO scheduled_tasks ${sql.insert({
      task_id: "bound",
      title: "定时任务",
      prompt: "private fixture",
      enabled: 1,
      schedule_json: "invalid-not-needed-for-this-read",
      project_id: "archive:project",
      thread_id: root,
      workspace_strategy_json: "{}",
      model_selection_json: "{}",
      runtime_mode: "full-access",
      interaction_mode: "default",
      created_by: "user",
      creation_source: "web",
      created_at: "2026-10-19T00:00:00Z",
      updated_at: "2026-10-19T00:00:00Z",
      next_run_at: null,
      last_run_at: null,
      last_run_status: "never",
      last_run_error: null,
      run_count: 0,
    })}`;
    yield* reject("schedule", "scheduled-task");
    assert.deepEqual(yield* sql`SELECT enabled, thread_id FROM scheduled_tasks`, [
      { enabled: 1, thread_id: root },
    ]);
    yield* sql`UPDATE scheduled_tasks SET enabled = 0`;
    assert.isNull(yield* projections.getArchiveBlockReason(root));
    yield* sql`UPDATE scheduled_tasks SET enabled = 1, thread_id = 'unrelated'`;
    assert.isNull(yield* projections.getArchiveBlockReason(root));
  }).pipe(Effect.provide(layer)),
);

it.effect(
  "blocks active direct child agents, then archives only the original leaving child and fork intact",
  () =>
    Effect.gen(function* () {
      yield* create;
      const sql = yield* SqlClient.SqlClient;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const original = yield* projections.getThread(root);
      const now = yield* DateTime.now;
      for (const relationship of ["subagent", "fork"] as const) {
        const id = ThreadId.make(relationship);
        yield* projections.apply({
          id: EventId.make(`created:${id}`),
          type: "thread.created",
          threadId: id,
          occurredAt: now,
          payload: {
            ...original,
            id,
            lineage: {
              parentThreadId: root,
              rootThreadId: root,
              relationshipToParent: relationship,
            },
          },
        });
      }
      yield* sql`INSERT INTO orchestration_v2_projection_runs
    (run_id, thread_id, ordinal, provider, status, requested_at, payload_json)
    VALUES ('child-run', 'subagent', 1, 'codex', 'waiting', '2026-10-19T00:00:00Z', '{}')`;
      yield* reject("child", "active-child");
      yield* sql`DELETE FROM orchestration_v2_projection_runs`;
      yield* orchestrator.dispatch({
        type: "thread.archive",
        commandId: CommandId.make("archive:success"),
        threadId: root,
        requireIdle: true,
      });
      assert.isNotNull((yield* projections.getThread(root)).archivedAt);
      assert.isNull((yield* projections.getThread(ThreadId.make("subagent"))).archivedAt);
      assert.isNull((yield* projections.getThread(ThreadId.make("fork"))).archivedAt);
      yield* orchestrator.dispatch({
        type: "thread.unarchive",
        commandId: CommandId.make("archive:undo"),
        threadId: root,
      });
      assert.isNull((yield* projections.getThread(root)).archivedAt);
    }).pipe(Effect.provide(layer)),
);

it.effect("fails closed when the scheduler read is unavailable", () =>
  Effect.gen(function* () {
    yield* create;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`DROP TABLE scheduled_tasks`;
    yield* reject("unavailable", "unavailable");
  }).pipe(Effect.provide(layer)),
);

it.effect("blocks provider-native child work without requiring a child thread", () =>
  Effect.gen(function* () {
    yield* create;
    const sql = yield* SqlClient.SqlClient;
    yield* sql`INSERT INTO orchestration_v2_projection_subagents
    (subagent_id, thread_id, parent_node_id, provider, origin, status, updated_at, payload_json)
    VALUES ('native-child', ${root}, 'root-node', 'codex', 'provider_native', 'running', '2026-10-19T00:00:00Z', '{}')`;
    yield* reject("native-child", "active-child");
  }).pipe(Effect.provide(layer)),
);

it.effect(
  "reads archived message bodies in bounded pages without unarchiving or producing events",
  () =>
    Effect.gen(function* () {
      yield* create;
      const sql = yield* SqlClient.SqlClient;
      const projections = yield* ProjectionStore.ProjectionStoreV2;
      const orchestrator = yield* Orchestrator.OrchestratorV2;
      const now = yield* DateTime.now;
      for (let ordinal = 1; ordinal <= 90; ordinal++) {
        yield* projections.apply({
          id: EventId.make(`history:${ordinal}`),
          type: "turn-item.updated",
          threadId: root,
          occurredAt: now,
          payload: {
            id: TurnItemId.make(`item:${ordinal}`),
            threadId: root,
            runId: null,
            nodeId: null,
            providerThreadId: null,
            providerTurnId: null,
            nativeItemRef: null,
            parentItemId: null,
            ordinal,
            status: "completed",
            title: null,
            startedAt: now,
            completedAt: now,
            updatedAt: now,
            type: "assistant_message",
            messageId: MessageId.make(`message:${ordinal}`),
            text: `正文 ${ordinal}`,
            streaming: false,
          },
        });
      }
      yield* orchestrator.dispatch({
        type: "thread.archive",
        commandId: CommandId.make("archive:history"),
        threadId: root,
        requireIdle: true,
      });
      const before = yield* sql`SELECT COUNT(*) AS count FROM orchestration_events`;
      const snapshot = yield* projections.getThreadSnapshotWindow(root, { rowLimit: 77 });
      const first = buildBoundedThreadProjection(snapshot);
      assert.isTrue(first.hasMoreHistory);
      assert.lengthOf(first.projection.visibleTurnItems, 75);
      assert.isNotNull(first.historyCursor);
      const older = yield* projections.getThreadHistoryPage(root, first.historyCursor!);
      assert.isFalse(older.hasMoreHistory);
      const ids = [...first.projection.visibleTurnItems, ...older.items].map((row) => row.item.id);
      assert.equal(new Set(ids).size, 90);
      assert.isNotNull((yield* projections.getThread(root)).archivedAt);
      assert.deepEqual(yield* sql`SELECT COUNT(*) AS count FROM orchestration_events`, before);
    }).pipe(Effect.provide(layer)),
);
