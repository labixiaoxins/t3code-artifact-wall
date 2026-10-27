import { assert, it } from "@effect/vitest";
import {
  type ServerProviderUsageLimits,
  ThreadId,
  ProjectId,
  ProviderInstanceId,
  ProviderDriverKind,
  CommandId,
  MessageId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Semaphore from "effect/Semaphore";
import {
  quotaStage,
  accountHasCapacity,
  taskFamily,
  type GuardWork,
} from "./ClaudeUsageProtection.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import * as Orchestrator from "./Orchestrator.ts";
import * as ProjectionStore from "./ProjectionStore.ts";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import type * as ProviderAdapter from "@t3tools/provider-core/server/ProviderAdapter";

const now = Date.parse("2026-10-27T00:00:00Z");
const limits = (usedPercent: number): ServerProviderUsageLimits => ({
  checkedAt: "2026-10-27T00:00:00Z",
  windows: [
    {
      id: "five_hour",
      kind: "session",
      label: "Session",
      usedPercent,
      resetsAt: "2026-10-27T01:00:00Z",
    },
  ],
});
it("distinguishes ready, warning and finish and never treats unknown/stale as free", () => {
  assert.equal(quotaStage(limits(79), now).stage, "ready");
  assert.equal(quotaStage(limits(80), now).stage, "warn");
  assert.equal(quotaStage(limits(90), now).stage, "finish");
  assert.equal(quotaStage(undefined, now).stage, "unknown");
  assert.equal(quotaStage(limits(5), now + 120001).stage, "unknown");
  assert.equal(quotaStage({ ...limits(1), checkedAt: "invalid" }, now).stage, "unknown");
  assert.equal(
    quotaStage({ ...limits(1), unavailable: { reason: "probeFailed" } }, now).stage,
    "unknown",
  );
  assert.equal(quotaStage(limits(NaN), now).stage, "unknown");
  assert.equal(quotaStage(limits(3), now + 3600001).stage, "unknown");
});
it("weekly exhaustion also requests finish", () => {
  const l = limits(2);
  assert.equal(
    quotaStage(
      { ...l, windows: [...l.windows, { ...l.windows[0]!, id: "seven_day", usedPercent: 92 }] },
      now,
    ).stage,
    "finish",
  );
});
const row = (threadId: string, status: string, requestedAt = "1"): GuardWork => ({
  threadId,
  status,
  runId: threadId,
  instanceId: "claude",
  requestedAt,
});
it("serializes unrelated tasks and permits dependencies without deadlocking their parent", () => {
  const parents = new Map([
    ["child", "parent"],
    ["nested", "child"],
  ]);
  assert.equal(accountHasCapacity("other", [row("parent", "running")], parents), false);
  assert.equal(accountHasCapacity("child", [row("parent", "waiting")], parents), true);
  assert.equal(accountHasCapacity("nested", [row("parent", "waiting")], parents), true);
  assert.equal(accountHasCapacity("other", [row("child", "running")], parents), false);
  assert.equal(taskFamily("nested", parents), "parent");
});
it("starts oldest queued group and releases completed/cancelled work", () => {
  assert.equal(
    accountHasCapacity("b", [row("a", "queued", "1"), row("b", "queued", "2")], new Map()),
    false,
  );
  assert.equal(
    accountHasCapacity("b", [row("a", "cancelled"), row("b", "queued")], new Map()),
    true,
  );
});
it.effect("persists a protected first prompt as queued without creating a provider process", () =>
  Effect.gen(function* () {
    const id = ProviderInstanceId.make("claude-guard-test");
    const adapter = {
      instanceId: id,
      driver: ProviderDriverKind.make("codex"),
      getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
      planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
      openSession: () => Effect.die("must not start a provider"),
    } as ProviderAdapter.ProviderAdapterV2["Service"];
    const db = SqlitePersistence.layerMemory;
    const lock = yield* Semaphore.make(1);
    let mayStart = false;
    const harness = ProviderReplayHarness.layerWithRegistry(
      { name: "usage-protection" },
      ProviderAdapterRegistry.layerFromAdapters([adapter]),
      {
        databaseLayer: db,
        runEffectWorker: false,
        usageProtection: {
          enabled: () => Effect.succeed(true),
          mayStart: () => Effect.sync(() => mayStart),
          activeNotices: Effect.succeed([]),
          refresh: Effect.void,
          withStartLock: lock.withPermits(1),
        },
      },
    );
    yield* Effect.gen(function* () {
      const o = yield* Orchestrator.OrchestratorV2;
      const p = yield* ProjectionStore.ProjectionStoreV2;
      const threadId = ThreadId.make("thread:guard-first");
      yield* o.dispatch({
        type: "thread.create",
        commandId: CommandId.make("create:guard"),
        threadId,
        projectId: ProjectId.make("project:usage-protection"),
        title: "Guard",
        modelSelection: { instanceId: id, model: "test" },
        runtimeMode: "approval-required",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdBy: "user",
        creationSource: "web",
      });
      yield* o.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("send:guard"),
        threadId,
        messageId: MessageId.make("message:guard"),
        text: "Implement the task",
        attachments: [],
        dispatchMode: { type: "start_immediately" },
        createdBy: "user",
        creationSource: "web",
      });
      const projection = yield* p.getThreadRecords(threadId, ["runs"]);
      assert.equal(projection.runs.length, 1);
      assert.equal(projection.runs[0]?.status, "queued");
      yield* o.resumeQueuedRuns;
      assert.equal((yield* p.getThreadRecords(threadId, ["runs"])).runs[0]?.status, "queued");
      const before = (yield* p.getThreadRecords(threadId, ["runs"])).runs[0]!;
      yield* o.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("stale:notice"),
        threadId,
        messageId: MessageId.make("stale:notice"),
        text: "save progress",
        attachments: [],
        dispatchMode: { type: "steer_active", targetRunId: before.id },
        usageProtectionForRunId: before.id,
        createdBy: "system",
        creationSource: "server",
      });
      assert.equal((yield* p.getThreadRecords(threadId, ["runs"])).runs.length, 1);
      const prep = ThreadId.make("thread:guard-prepared");
      yield* o.dispatch({
        type: "thread.create",
        commandId: CommandId.make("create:prepared"),
        threadId: prep,
        projectId: ProjectId.make("project:usage-protection"),
        title: "Prepared",
        modelSelection: { instanceId: id, model: "test" },
        runtimeMode: "approval-required",
        interactionMode: "default",
        branch: null,
        worktreePath: null,
        createdBy: "user",
        creationSource: "web",
      });
      yield* o.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make("send:prepared"),
        threadId: prep,
        messageId: MessageId.make("message:prepared"),
        text: "Implement",
        attachments: [],
        dispatchMode: { type: "defer_start" },
        createdBy: "user",
        creationSource: "web",
      });
      const prepared = (yield* p.getThreadRecords(prep, ["runs"])).runs[0]!;
      assert.equal(prepared.status, "preparing");
      yield* o.dispatch({
        type: "prepared-run.release",
        commandId: CommandId.make("release:prepared"),
        threadId: prep,
        runId: prepared.id,
      });
      assert.equal((yield* p.getThreadRecords(prep, ["runs"])).runs[0]?.status, "queued");
      // v0.1.2 resumes durable queued runs through the guarded start path after recovery.
      mayStart = true;
      yield* o.resumeQueuedRuns;
      assert.equal((yield* p.getThreadRecords(threadId, ["runs"])).runs[0]?.status, "starting");
      assert.equal((yield* p.getThreadRecords(prep, ["runs"])).runs[0]?.status, "starting");
    }).pipe(Effect.provide(Layer.merge(harness, ProjectionStore.layer.pipe(Layer.provide(db)))));
  }).pipe(Effect.scoped),
);

it.effect(
  "real guard reads durable queue order, shares aliases, releases cancellation and blocks stale quota",
  () =>
    Effect.gen(function* () {
      const { layer: sqlite } = yield* Effect.promise(
        () => import("@t3tools/shared/nodeSqliteClient"),
      );
      const Sql = yield* Effect.promise(() => import("effect/sql/SqlClient"));
      const Guard = yield* Effect.promise(() => import("./ClaudeUsageProtection.ts"));
      const Settings = yield* Effect.promise(() => import("../serverSettings.ts"));
      const Registry = yield* Effect.promise(() => import("../provider/ProviderRegistry.ts"));
      const NodeServices = yield* Effect.promise(
        () => import("@effect/platform-node/NodeServices"),
      );
      const TestClock = yield* Effect.promise(() => import("effect/testing/TestClock"));
      yield* TestClock.setTime(now);
      let quotaValue = limits(10);
      const providers = Layer.mock(Registry.ProviderRegistry)({
        getProviders: Effect.sync(() =>
          ["p", "alias"].map(
            (id) =>
              ({
                instanceId: ProviderInstanceId.make(id),
                usageLimits: quotaValue,
              }) as import("@t3tools/contracts").ServerProvider,
          ),
        ),
        refreshInstance: () => Effect.succeed([]),
      });
      const db = sqlite({ filename: ":memory:" });
      const settings = Settings.layerTest({
        providerInstances: {
          [ProviderInstanceId.make("p")]: {
            driver: ProviderDriverKind.make("claudeAgent"),
            enabled: true,
            config: { homePath: "/account/shared", usageProtection: true },
          },
          [ProviderInstanceId.make("alias")]: {
            driver: ProviderDriverKind.make("claudeAgent"),
            enabled: true,
            config: { homePath: "/account/shared" },
          },
        },
      });
      const env = Layer.mergeAll(db, settings, providers, NodeServices.layer);
      yield* Effect.gen(function* () {
        const sql = yield* Sql.SqlClient;
        const guard = yield* Guard.ClaudeUsageProtection;
        yield* sql`CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT, payload_json TEXT, deleted_at TEXT, archived_at TEXT)`;
        yield* sql`CREATE TABLE orchestration_v2_projection_runs(thread_id TEXT, run_id TEXT, provider_instance_id TEXT, status TEXT, requested_at TEXT, payload_json TEXT)`;
        yield* sql`INSERT INTO orchestration_v2_projection_threads VALUES('a','{}',NULL,NULL),('b','{}',NULL,NULL)`;
        yield* sql`INSERT INTO orchestration_v2_projection_runs VALUES('a','ra','p','queued','1','{}'),('b','rb','alias','queued','2','{}')`;
        assert.equal(yield* guard.enabled("alias"), true);
        assert.equal(yield* guard.mayStart(ThreadId.make("a"), "p"), true);
        assert.equal(yield* guard.mayStart(ThreadId.make("b"), "alias"), false);
        yield* sql`UPDATE orchestration_v2_projection_runs SET status='running' WHERE run_id='ra'`;
        assert.equal(yield* guard.mayStart(ThreadId.make("b"), "alias"), false);
        yield* sql`UPDATE orchestration_v2_projection_runs SET status='cancelled' WHERE run_id='ra'`;
        assert.equal(yield* guard.mayStart(ThreadId.make("b"), "alias"), true);
        quotaValue = limits(90);
        assert.equal(yield* guard.mayStart(ThreadId.make("b"), "alias"), false);
        quotaValue = limits(10);
        yield* TestClock.adjust("3 minutes");
        assert.equal(yield* guard.mayStart(ThreadId.make("b"), "alias"), false);
      }).pipe(Effect.provide(Layer.provideMerge(Guard.layer, env)));
    }).pipe(Effect.scoped),
);

it.effect(
  "quota worker sends each stage once and resumes the durable queue without polling a model",
  () =>
    Effect.gen(function* () {
      const Guard = yield* Effect.promise(() => import("./ClaudeUsageProtection.ts"));
      const Worker = yield* Effect.promise(() => import("./ClaudeUsageProtectionWorker.ts"));
      let stage: "warn" | "finish" = "warn";
      let resumed = 0;
      const calls: Parameters<Orchestrator.OrchestratorV2["Service"]["dispatch"]>[0][] = [];
      const guard = Layer.mock(Guard.ClaudeUsageProtection)({
        refresh: Effect.void,
        activeNotices: Effect.sync(() => [
          {
            work: row("a", "running"),
            stage,
            key: "five-hour:reset",
            usedPercent: stage === "warn" ? 80 : 90,
          },
        ]),
      });
      const orchestrator = Layer.mock(Orchestrator.OrchestratorV2)({
        dispatch: (cmd) =>
          Effect.sync(() => {
            calls.push(cmd);
            return { sequence: 0, storedEvents: [] };
          }),
        resumeQueuedRuns: Effect.sync(() => ++resumed),
      });
      const { sweep } = yield* Worker.makeSweep.pipe(
        Effect.provide(Layer.merge(guard, orchestrator)),
      );
      yield* sweep;
      yield* sweep;
      assert.equal(calls.length, 1);
      stage = "finish";
      yield* sweep;
      yield* sweep;
      assert.equal(calls.length, 2);
      assert.equal(resumed, 4);
      for (const c of calls) {
        assert.equal(c.type, "message.dispatch");
        if (c.type === "message.dispatch") {
          assert.equal(c.usageProtectionForRunId, "a");
          assert.equal(c.dispatchMode.type, "steer_active");
        }
      }
    }),
);
