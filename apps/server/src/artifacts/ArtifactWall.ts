// @effect-diagnostics nodeBuiltinImport:off - bounded header reads and canonical inode identities.
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import type { WallArtifact } from "@t3tools/contracts";
import { readImageDimensions } from "@t3tools/shared/imageDimensions";
import * as Clock from "effect/Clock";
import * as Option from "effect/Option";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import * as ServerConfig from "../config.ts";
import { openMediaFile, readMediaFileHeader } from "../assets/MediaFile.ts";
import {
  artifactKind,
  artifactReferenceIsFresh,
  resolveArtifactCandidates,
  dedupeCandidates,
  excludedArtifactPath,
  type ArtifactRecord,
} from "./collection.ts";

export class ArtifactWallError extends Schema.TaggedError<ArtifactWallError>()(
  "ArtifactWallError",
  { cause: Schema.Defect() },
) {
  override get message() {
    return "Unable to collect artifacts.";
  }
}
interface AllowedFile {
  artifact: WallArtifact;
  device: string;
  inode: string;
  expires: number;
}
export class ArtifactWall extends Context.Service<
  ArtifactWall,
  {
    readonly list: (
      threadId: string,
      scope: "thread" | "project",
    ) => Effect.Effect<readonly WallArtifact[], ArtifactWallError>;
    readonly open: (id: string) => Effect.Effect<
      {
        artifact: WallArtifact;
        file: NonNullable<Effect.Success<ReturnType<typeof openMediaFile>>>;
      } | null,
      ArtifactWallError,
      import("effect/Scope").Scope
    >;
  }
>()("t3/artifacts/ArtifactWall") {}
const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const config = yield* ServerConfig.ServerConfig;
  const allowed = new Map<string, AllowedFile>();
  const keys = new Map<string, string>();
  const extraRoots = (process.env.T3CODE_ARTIFACT_EXCLUDE_DIRS ?? "")
    .split(NodePath.delimiter)
    .filter(Boolean)
    .map((p) => NodePath.resolve(p));
  const list = Effect.fn("ArtifactWall.list")(function* (
    threadId: string,
    scope: "thread" | "project",
  ) {
    const threads = yield* sql<{ thread_id: string; cwd: string; created_at: string }>`
      SELECT t.thread_id, t.created_at, COALESCE(json_extract(t.payload_json, '$.worktreePath'), p.workspace_root) AS cwd
      FROM orchestration_v2_projection_threads t JOIN projection_projects p ON p.project_id=t.project_id
      WHERE t.deleted_at IS NULL AND p.deleted_at IS NULL AND
        ((${scope}='thread' AND t.thread_id=${threadId}) OR
         (${scope}='project' AND t.archived_at IS NULL AND t.project_id=(
           SELECT project_id FROM orchestration_v2_projection_threads WHERE thread_id=${threadId} AND deleted_at IS NULL)))`;
    const decodePayload = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));
    const records: ArtifactRecord[] = [];
    // Read only the requested real project; never scan every project's message history.
    for (const thread of threads) {
      const rows = yield* sql<{ payload_json: string; created_at: string }>`
        SELECT payload_json, created_at FROM orchestration_v2_projection_messages
          WHERE thread_id=${thread.thread_id} AND role IN ('assistant','user')
        UNION ALL SELECT payload_json, COALESCE(json_extract(payload_json,'$.startedAt'), updated_at) AS created_at
          FROM orchestration_v2_projection_turn_items WHERE thread_id=${thread.thread_id}
          AND type IN ('file_change','command_execution','dynamic_tool','assistant_message','user_message')`;
      for (const row of rows) {
        const payload = decodePayload(row.payload_json);
        if (
          Option.isSome(payload) &&
          typeof payload.value === "object" &&
          payload.value !== null &&
          !Array.isArray(payload.value)
        )
          records.push({
            threadId: thread.thread_id,
            cwd: thread.cwd ?? "",
            createdAt: row.created_at,
            payload: payload.value as Record<string, unknown>,
          });
      }
    }
    const candidates = yield* Effect.tryPromise({
      try: () =>
        resolveArtifactCandidates(records, config.attachmentsDir, {
          homeDir: NodeOS.homedir(),
          isFile: async (path) => {
            if (excludedArtifactPath(path, extraRoots)) return false;
            try {
              const canonical = await NodeFS.realpath(path);
              if (excludedArtifactPath(canonical, extraRoots)) return false;
              const stat = await NodeFS.stat(canonical);
              return stat.isFile() && stat.ino !== 0;
            } catch {
              return false;
            }
          },
        }),
      catch: (cause) => new ArtifactWallError({ cause }),
    });
    const threadCreatedAt = new Map(threads.map((thread) => [thread.thread_id, thread.created_at]));
    const files = yield* Effect.forEach(
      candidates,
      (candidate) =>
        Effect.tryPromise({
          try: async () => {
            if (excludedArtifactPath(candidate.path, extraRoots)) return null;
            try {
              const canonical = await NodeFS.realpath(candidate.path);
              if (excludedArtifactPath(canonical, extraRoots)) return null;
              const stat = await NodeFS.stat(canonical);
              if (
                !stat.isFile() ||
                stat.ino === 0 ||
                !artifactReferenceIsFresh(
                  candidate.source,
                  stat.mtimeMs,
                  threadCreatedAt.get(candidate.threadId) ?? "",
                )
              )
                return null;
              return { candidate: { ...candidate, path: canonical }, stat };
            } catch {
              return null;
            }
          },
          catch: (cause) => new ArtifactWallError({ cause }),
        }),
      { concurrency: 8 },
    );
    const existing = files.filter((f) => f !== null);
    const stats = new Map(existing.map((f) => [f.candidate.path, f.stat]));
    const unique = dedupeCandidates(existing.map((f) => f.candidate));
    const now = yield* Clock.currentTimeMillis;
    for (const [id, entry] of allowed)
      if (entry.expires < now) {
        allowed.delete(id);
        keys.delete(entry.artifact.path);
      }
    return yield* Effect.forEach(
      unique,
      (candidate) =>
        Effect.tryPromise({
          try: async () => {
            const stat = stats.get(candidate.path)!;
            const extension = NodePath.extname(candidate.path).slice(1).toLowerCase();
            const kind = artifactKind(extension);
            const dimensions =
              kind === "image"
                ? await Effect.runPromise(
                    Effect.scoped(
                      openMediaFile(candidate.path, {
                        device: String(stat.dev),
                        inode: String(stat.ino),
                      }).pipe(
                        Effect.flatMap((file) =>
                          file
                            ? readMediaFileHeader(candidate.path, file, 65536).pipe(
                                Effect.map(readImageDimensions),
                              )
                            : Effect.succeed(null),
                        ),
                        Effect.orElseSucceed(() => null),
                      ),
                    ),
                  )
                : null;
            const id = keys.get(candidate.path) ?? NodeCrypto.randomBytes(32).toString("hex");
            const artifact: WallArtifact = {
              ...candidate,
              id,
              extension,
              kind,
              sizeBytes: stat.size,
              ...(dimensions ?? {}),
            };
            keys.set(candidate.path, id);
            allowed.set(id, {
              artifact,
              device: String(stat.dev),
              inode: String(stat.ino),
              expires: now + 15 * 60_000,
            });
            return artifact;
          },
          catch: (cause) => new ArtifactWallError({ cause }),
        }),
      { concurrency: 8 },
    );
  });
  const open = Effect.fn("ArtifactWall.open")(function* (id: string) {
    const entry = allowed.get(id);
    if (!entry || entry.expires < (yield* Clock.currentTimeMillis)) return null;
    // Do not accept paths, even if they exist. Hold the validated descriptor through streaming.
    const file = yield* openMediaFile(entry.artifact.path, entry).pipe(
      Effect.orElseSucceed(() => null),
    );
    return file ? { artifact: entry.artifact, file } : null;
  });
  return ArtifactWall.of({
    list: (threadId, scope) =>
      list(threadId, scope).pipe(Effect.mapError((cause) => new ArtifactWallError({ cause }))),
    open,
  });
});
export const layer = Layer.effect(ArtifactWall, make);
