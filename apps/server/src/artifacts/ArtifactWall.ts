// @effect-diagnostics nodeBuiltinImport:off - bounded header reads and canonical inode identities.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import type { WallArtifact, WallArtifactVerification } from "@t3tools/contracts";
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
import {
  artifactRevision,
  readArtifactVerification,
  writeArtifactCheck,
  type ArtifactCheckReceipt,
} from "./verification.ts";

export class ArtifactCheckRejected extends Schema.TaggedError<ArtifactCheckRejected>()(
  "ArtifactCheckRejected",
  {
    reason: Schema.Literals([
      "file_changed",
      "evidence_missing",
      "evidence_unfinished",
      "evidence_outdated",
    ]),
  },
) {
  override get message() {
    return `Artifact check rejected: ${this.reason}. Refresh the artifact list or read the original command record before retrying.`;
  }
}

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
const isArtifactCheckRejected = Schema.is(ArtifactCheckRejected);
const isArtifactWallError = Schema.is(ArtifactWallError);
export class ArtifactWall extends Context.Service<
  ArtifactWall,
  {
    readonly list: (
      threadId: string,
      scope: "thread" | "project",
    ) => Effect.Effect<readonly WallArtifact[], ArtifactWallError>;
    readonly recordCheck: (input: {
      readonly threadId: string;
      readonly path: string;
      readonly revision: string;
      readonly label: string;
      readonly evidenceItemId: string;
    }) => Effect.Effect<WallArtifactVerification, ArtifactWallError | ArtifactCheckRejected>;
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
              const canonical = await NodeFSP.realpath(path);
              if (excludedArtifactPath(canonical, extraRoots)) return false;
              const stat = await NodeFSP.stat(canonical);
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
              const canonical = await NodeFSP.realpath(candidate.path);
              if (excludedArtifactPath(canonical, extraRoots)) return null;
              const stat = await NodeFSP.stat(canonical, { bigint: true });
              if (
                !stat.isFile() ||
                stat.ino === 0n ||
                !artifactReferenceIsFresh(
                  candidate.source,
                  Number(stat.mtimeMs),
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
            const revision = artifactRevision(stat);
            const previousId = keys.get(candidate.path);
            const previous = previousId === undefined ? undefined : allowed.get(previousId);
            const id =
              previous?.artifact.revision === revision
                ? previousId!
                : NodeCrypto.randomBytes(32).toString("hex");
            if (previousId !== undefined && previousId !== id) allowed.delete(previousId);
            const artifact: WallArtifact = {
              ...candidate,
              id,
              extension,
              kind,
              sizeBytes: Number(stat.size),
              revision,
              modifiedAt: stat.mtime.toISOString(),
              verification: await readArtifactVerification(
                config.baseDir,
                candidate.threadId,
                candidate.path,
                revision,
              ),
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
    return file && artifactRevision(file.info) === entry.artifact.revision
      ? { artifact: entry.artifact, file }
      : null;
  });
  const recordCheck = Effect.fn("ArtifactWall.recordCheck")(function* (input: {
    readonly threadId: string;
    readonly path: string;
    readonly revision: string;
    readonly label: string;
    readonly evidenceItemId: string;
  }) {
    const artifact = (yield* list(input.threadId, "thread")).find(
      (entry) => entry.path === input.path,
    );
    if (!artifact || artifact.revision !== input.revision)
      return yield* new ArtifactCheckRejected({ reason: "file_changed" });
    const rows = yield* sql<{ payload_json: string; updated_at: string }>`
      SELECT payload_json, updated_at FROM orchestration_v2_projection_turn_items
      WHERE thread_id=${input.threadId} AND turn_item_id=${input.evidenceItemId}
        AND type='command_execution' LIMIT 1`;
    const row = rows[0];
    const decode = Schema.decodeUnknownOption(
      Schema.fromJsonString(
        Schema.Struct({
          type: Schema.Literal("command_execution"),
          status: Schema.String,
          exitCode: Schema.NullOr(Schema.Number),
          completedAt: Schema.NullOr(Schema.String),
        }),
      ),
    );
    const decoded = row === undefined ? Option.none() : decode(row.payload_json);
    if (Option.isNone(decoded))
      return yield* new ArtifactCheckRejected({ reason: "evidence_missing" });
    const evidence = decoded.value;
    if (
      !["completed", "failed"].includes(evidence.status) ||
      evidence.exitCode === null ||
      evidence.completedAt === null
    )
      return yield* new ArtifactCheckRejected({ reason: "evidence_unfinished" });
    const checkedAt = Date.parse(evidence.completedAt);
    if (!Number.isFinite(checkedAt) || checkedAt < Date.parse(artifact.modifiedAt!))
      return yield* new ArtifactCheckRejected({ reason: "evidence_outdated" });
    const status = evidence.status === "completed" && evidence.exitCode === 0 ? "passed" : "failed";
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const opened = yield* open(artifact.id);
        if (!opened) return yield* new ArtifactCheckRejected({ reason: "file_changed" });
        const sha256 = yield* Effect.tryPromise({
          try: async () => {
            const hash = NodeCrypto.createHash("sha256");
            const buffer = new Uint8Array(256 * 1024);
            let position = 0;
            while (position < Number(opened.file.info.size)) {
              const { bytesRead } = await opened.file.handle.read(
                buffer,
                0,
                Math.min(buffer.length, Number(opened.file.info.size) - position),
                position,
              );
              if (bytesRead === 0) break;
              hash.update(buffer.subarray(0, bytesRead));
              position += bytesRead;
            }
            return hash.digest("hex");
          },
          catch: (cause) => new ArtifactWallError({ cause }),
        });
        const current = yield* Effect.tryPromise({
          try: () => opened.file.handle.stat({ bigint: true }),
          catch: (cause) => new ArtifactWallError({ cause }),
        });
        if (artifactRevision(current) !== artifact.revision)
          return yield* new ArtifactCheckRejected({ reason: "file_changed" });
        const receipt: ArtifactCheckReceipt = {
          revision: artifact.revision!,
          sha256,
          status,
          label: input.label,
          checkedAt: evidence.completedAt!,
          evidenceItemId: input.evidenceItemId,
        };
        yield* Effect.tryPromise({
          try: () => writeArtifactCheck(config.baseDir, input.threadId, artifact.path, receipt),
          catch: (cause) => new ArtifactWallError({ cause }),
        });
        return {
          status,
          label: receipt.label,
          checkedAt: receipt.checkedAt,
          evidenceItemId: receipt.evidenceItemId,
        } satisfies WallArtifactVerification;
      }),
    );
  });
  return ArtifactWall.of({
    list: (threadId, scope) =>
      list(threadId, scope).pipe(Effect.mapError((cause) => new ArtifactWallError({ cause }))),
    open,
    recordCheck: (input) =>
      recordCheck(input).pipe(
        Effect.mapError((cause) =>
          isArtifactCheckRejected(cause) || isArtifactWallError(cause)
            ? cause
            : new ArtifactWallError({ cause }),
        ),
      ),
  });
});
export const layer = Layer.effect(ArtifactWall, make);
