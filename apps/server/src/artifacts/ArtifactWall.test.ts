// @effect-diagnostics nodeBuiltinImport:off preferSchemaOverJson:off - fictional persistence fixture.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/sql/SqlClient";
import * as TestClock from "effect/testing/TestClock";
import * as ServerConfig from "../config.ts";
import * as ArtifactWall from "./ArtifactWall.ts";
import { resolveAttachmentPath } from "../attachmentStore.ts";
const db = NodeSqliteClient.layer({ filename: ":memory:" });
const layer = ArtifactWall.layer.pipe(
  Layer.provideMerge(db),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "t3-artifact-wall-" })),
  Layer.provideMerge(NodeServices.layer),
);
const fixture = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const config = yield* ServerConfig.ServerConfig;
  yield* sql`CREATE TABLE projection_projects(project_id TEXT,workspace_root TEXT,deleted_at TEXT)`;
  yield* sql`CREATE TABLE orchestration_v2_projection_threads(thread_id TEXT,project_id TEXT,archived_at TEXT,deleted_at TEXT,payload_json TEXT,created_at TEXT)`;
  yield* sql`CREATE TABLE orchestration_v2_projection_messages(thread_id TEXT,role TEXT,created_at TEXT,payload_json TEXT)`;
  yield* sql`CREATE TABLE orchestration_v2_projection_turn_items(thread_id TEXT,type TEXT,updated_at TEXT,payload_json TEXT)`;
  const cwd = NodePath.join(config.baseDir, "outputs");
  yield* Effect.promise(() => NodeFSP.mkdir(cwd, { recursive: true }));
  yield* sql`INSERT INTO projection_projects VALUES ('p',${cwd},NULL),('other',${cwd},NULL)`;
  for (const [thread, project, archived, deleted] of [
    ["one", "p", null, null],
    ["two", "p", null, null],
    ["archived", "p", "2026-10-06", null],
    ["deleted", "p", null, "2026-10-06"],
    ["other", "other", null, null],
  ] as const)
    yield* sql`INSERT INTO orchestration_v2_projection_threads VALUES (${thread},${project},${archived},${deleted},'{}','2026-01-01T00:00:00Z')`;
  const put = (thread: string, name: string, text: string) =>
    Effect.gen(function* () {
      yield* Effect.promise(() => NodeFSP.writeFile(NodePath.join(cwd, name), "fictional file"));
      yield* sql`INSERT INTO orchestration_v2_projection_messages VALUES (${thread},'assistant','2026-10-06T01:00:00Z',${JSON.stringify({ role: "assistant", text })})`;
    });
  yield* put(
    "one",
    "one.pdf",
    "./one.pdf ./missing.png ./node_modules/skip.png ./folder/alias.pdf",
  );
  yield* Effect.promise(async () => {
    await NodeFSP.mkdir(NodePath.join(cwd, "folder"));
    await NodeFSP.symlink(NodePath.join(cwd, "one.pdf"), NodePath.join(cwd, "folder/alias.pdf"));
    await NodeFSP.mkdir(NodePath.join(cwd, "node_modules"));
    await NodeFSP.writeFile(NodePath.join(cwd, "node_modules/skip.png"), "skip");
  });
  yield* put("two", "two.pdf", "./two.pdf");
  yield* put("archived", "archived.pdf", "./archived.pdf");
  yield* put("deleted", "deleted.pdf", "./deleted.pdf");
  yield* put("other", "other.pdf", "./other.pdf");
  return { cwd, sql };
});
describe("ArtifactWall service", () => {
  it.effect(
    "binds real command evidence to a file revision and expires it after an in-place edit",
    () =>
      Effect.gen(function* () {
        const { sql } = yield* fixture;
        yield* sql`ALTER TABLE orchestration_v2_projection_turn_items ADD COLUMN turn_item_id TEXT`;
        const wall = yield* ArtifactWall.ArtifactWall;
        const artifact = (yield* wall.list("one", "thread"))[0]!;
        expect(artifact.verification?.status).toBe("unverified");
        const completedAt = DateTime.formatIso(
          DateTime.makeUnsafe(Date.parse(artifact.modifiedAt!) + 1_000),
        );
        yield* sql`INSERT INTO orchestration_v2_projection_turn_items
        (thread_id,type,updated_at,payload_json,turn_item_id) VALUES
        ('one','command_execution',${completedAt},${JSON.stringify({ type: "command_execution", status: "completed", exitCode: 0, completedAt })},'check:one')`;
        const input = {
          threadId: "one",
          path: artifact.path,
          revision: artifact.revision!,
          label: "PDF opens and expected pages exist",
          evidenceItemId: "check:one",
        };
        expect((yield* wall.recordCheck(input)).status).toBe("passed");
        expect((yield* wall.recordCheck(input)).status).toBe("passed");
        // A fresh service reads the same private receipt after a restart.
        const restarted = yield* ArtifactWall.ArtifactWall.pipe(Effect.provide(ArtifactWall.layer));
        expect((yield* restarted.list("one", "thread"))[0]?.verification?.status).toBe("passed");
        yield* Effect.promise(() => NodeFSP.writeFile(artifact.path, "updated after validation"));
        expect(yield* Effect.scoped(wall.open(artifact.id))).toBeNull();
        const changed = (yield* wall.list("one", "thread"))[0]!;
        expect(changed.id).not.toBe(artifact.id);
        expect(changed.revision).not.toBe(artifact.revision);
        expect(changed.verification?.status).toBe("stale");
        const failure = yield* wall.recordCheck(input).pipe(Effect.flip);
        expect(failure._tag).toBe("ArtifactCheckRejected");
      }).pipe(Effect.provide(layer)),
  );

  it.effect(
    "rejects unrelated, unfinished and older checks; preserves a failed command as failed",
    () =>
      Effect.gen(function* () {
        const { sql } = yield* fixture;
        yield* sql`ALTER TABLE orchestration_v2_projection_turn_items ADD COLUMN turn_item_id TEXT`;
        const wall = yield* ArtifactWall.ArtifactWall;
        const artifact = (yield* wall.list("one", "thread"))[0]!;
        const input = {
          threadId: "one",
          path: artifact.path,
          revision: artifact.revision!,
          label: "check",
          evidenceItemId: "check",
        };
        const fresh = DateTime.formatIso(
          DateTime.makeUnsafe(Date.parse(artifact.modifiedAt!) + 1_000),
        );
        for (const [id, thread, status, exitCode, completedAt] of [
          ["foreign", "other", "completed", 0, fresh],
          ["unfinished", "one", "running", null, null],
          ["old", "one", "completed", 0, "2000-01-01T00:00:00.000Z"],
          ["failed", "one", "failed", 1, fresh],
        ] as const) {
          yield* sql`INSERT INTO orchestration_v2_projection_turn_items
          (thread_id,type,updated_at,payload_json,turn_item_id) VALUES
          (${thread},'command_execution',${fresh},${JSON.stringify({ type: "command_execution", status, exitCode, completedAt })},${id})`;
        }
        for (const [id, reason] of [
          ["foreign", "evidence_missing"],
          ["unfinished", "evidence_unfinished"],
          ["old", "evidence_outdated"],
        ] as const) {
          const result = yield* wall
            .recordCheck({ ...input, evidenceItemId: id })
            .pipe(Effect.flip);
          expect(result).toMatchObject({ _tag: "ArtifactCheckRejected", reason });
        }
        expect((yield* wall.recordCheck({ ...input, evidenceItemId: "failed" })).status).toBe(
          "failed",
        );
        expect((yield* wall.list("one", "thread"))[0]?.verification?.status).toBe("failed");
      }).pipe(Effect.provide(layer)),
  );
  it.effect(
    "filters using each thread creation time before dedupe, preserving old attachments and explicit changes",
    () =>
      Effect.gen(function* () {
        const { cwd, sql } = yield* fixture;
        const config = yield* ServerConfig.ServerConfig;
        yield* sql`UPDATE orchestration_v2_projection_threads SET created_at='2026-10-06T10:00:00Z' WHERE thread_id='one'`;
        const attachment = {
          type: "file" as const,
          id: "one-11111111-1111-4111-8111-111111111111-pdf",
          name: "old-attachment.pdf",
          mimeType: "application/pdf",
          sizeBytes: 8,
        };
        const attachmentPath = resolveAttachmentPath({
          attachmentsDir: config.attachmentsDir,
          attachment,
        })!;
        yield* Effect.promise(async () => {
          await NodeFSP.mkdir(NodePath.dirname(attachmentPath), { recursive: true });
          await NodeFSP.writeFile(attachmentPath, "fiction");
          await NodeFSP.writeFile(NodePath.join(cwd, "new.pdf"), "fiction");
          await NodeFSP.writeFile(NodePath.join(cwd, "changed.pdf"), "fiction");
          const old = Date.parse("2026-09-24T00:00:00Z") / 1000,
            fresh = Date.parse("2026-10-06T10:01:00Z") / 1000;
          await NodeFSP.utimes(attachmentPath, old, old);
          await NodeFSP.utimes(NodePath.join(cwd, "one.pdf"), old, old);
          await NodeFSP.utimes(NodePath.join(cwd, "changed.pdf"), old, old);
          await NodeFSP.utimes(NodePath.join(cwd, "new.pdf"), fresh, fresh);
        });
        yield* sql`INSERT INTO orchestration_v2_projection_messages VALUES ('one','user','2026-10-06T12:00:00Z',${JSON.stringify({ role: "user", text: "./one.pdf ./new.pdf", attachments: [attachment] })})`;
        yield* sql`INSERT INTO orchestration_v2_projection_turn_items VALUES ('one','file_change','2026-10-06T12:00:00Z',${JSON.stringify({ type: "file_change", fileName: "changed.pdf" })})`;
        const wall = yield* ArtifactWall.ArtifactWall;
        const results = yield* wall.list("one", "thread");
        expect(results.map((a) => a.name).sort()).toEqual([
          "changed.pdf",
          "new.pdf",
          "old-attachment.pdf",
        ]);
        expect(results.find((a) => a.name === "old-attachment.pdf")?.source).toBe("attachment");
        expect(results.find((a) => a.name === "new.pdf")?.source).toBe("path_reference");
        // Same old file can be eligible in a different, older thread in project scope.
        yield* sql`INSERT INTO orchestration_v2_projection_messages VALUES ('two','assistant','2026-10-06T12:00:00Z',${JSON.stringify({ role: "assistant", text: "./one.pdf" })})`;
        expect(
          (yield* wall.list("one", "project")).some(
            (a) => a.name === "one.pdf" && a.threadId === "two",
          ),
        ).toBe(true);
      }).pipe(Effect.provide(layer)),
  );

  it.effect(
    "collects existing files, canonicalises aliases, excludes missing/modules and scopes real project membership",
    () =>
      Effect.gen(function* () {
        yield* fixture;
        const wall = yield* ArtifactWall.ArtifactWall;
        expect((yield* wall.list("one", "thread")).map((a) => a.name)).toEqual(["one.pdf"]);
        expect((yield* wall.list("one", "project")).map((a) => a.name).sort()).toEqual([
          "one.pdf",
          "two.pdf",
        ]);
        expect(yield* wall.list("missing", "project")).toEqual([]);
      }).pipe(Effect.provide(layer)),
  );
  it.effect(
    "opens only collected capabilities and rejects arbitrary path, unknown ID, replaced inode and symlink swap",
    () =>
      Effect.gen(function* () {
        const { cwd } = yield* fixture;
        const wall = yield* ArtifactWall.ArtifactWall;
        const artifacts = yield* wall.list("one", "thread");
        const artifact = artifacts[0]!;
        expect(
          yield* Effect.scoped(wall.open(artifact.id).pipe(Effect.map((v) => v !== null))),
        ).toBe(true);
        expect(yield* Effect.scoped(wall.open(NodePath.join(cwd, "other.pdf")))).toBeNull();
        expect(yield* Effect.scoped(wall.open("uncollected"))).toBeNull();
        yield* Effect.promise(async () => {
          await NodeFSP.rename(artifact.path, artifact.path + ".old");
          await NodeFSP.writeFile(artifact.path, "new inode");
        });
        expect(yield* Effect.scoped(wall.open(artifact.id))).toBeNull();
        yield* Effect.promise(async () => {
          await NodeFSP.unlink(artifact.path);
          await NodeFSP.symlink(NodePath.join(cwd, "other.pdf"), artifact.path);
        });
        expect(yield* Effect.scoped(wall.open(artifact.id))).toBeNull();
      }).pipe(Effect.provide(layer)),
  );
  it.effect("rejects expired collected capabilities", () =>
    Effect.gen(function* () {
      yield* fixture;
      const wall = yield* ArtifactWall.ArtifactWall;
      const artifact = (yield* wall.list("one", "thread"))[0]!;
      yield* TestClock.adjust("16 minutes");
      expect(yield* Effect.scoped(wall.open(artifact.id))).toBeNull();
    }).pipe(Effect.provide(layer)),
  );
});
