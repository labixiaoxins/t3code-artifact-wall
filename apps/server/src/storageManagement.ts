// @effect-diagnostics nodeBuiltinImport:off - a fixed Python worker uses streaming tar verification without copying whole archives into RAM.
import * as NodeChildProcess from "node:child_process";
import * as HostProcess from "@t3tools/shared/HostProcess";
import {
  StorageActionInput,
  StorageInspection,
  StorageInspectInput,
  StorageOperation,
  StorageManagementError,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as ServerConfig from "./config.ts";
import * as StorageCleanup from "./storageCleanup.ts";
import { STORAGE_ARCHIVE_PROGRAM } from "./storageArchiveProgram.ts";

export class StorageManagement extends Context.Service<
  StorageManagement,
  {
    readonly inspect: (
      input: StorageInspectInput,
    ) => Effect.Effect<StorageInspection, StorageManagementError>;
    readonly manage: (
      input: StorageActionInput,
    ) => Effect.Effect<StorageOperation, StorageManagementError>;
  }
>()("t3/storageManagement") {}

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const platform = yield* HostProcess.Platform;
  const cleanup = yield* StorageCleanup.StorageCleanup;
  const scope = yield* Scope.Scope;
  const call = Effect.fn("StorageManagement.worker")(function* (input: object) {
    return yield* Effect.tryPromise({
      try: () =>
        new Promise<unknown>((resolve, reject) => {
          if (platform !== "darwin") {
            reject(new Error("当前归档操作需要 macOS 的 Python 3；不会执行清理"));
            return;
          }
          const child = NodeChildProcess.spawn(
            "/usr/bin/python3",
            ["-c", STORAGE_ARCHIVE_PROGRAM],
            {
              stdio: ["pipe", "pipe", "pipe"],
            },
          );
          let output = "";
          let stderr = "";
          child.stdout.on("data", (data) => {
            output += String(data);
          });
          child.stderr.on("data", (data) => {
            stderr = (stderr + String(data)).slice(-2000);
          });
          child.on("error", reject);
          child.on("close", (code) => {
            try {
              const result: unknown = JSON.parse(output);
              if (code !== 0)
                reject(
                  new Error(
                    typeof result === "object" && result !== null && "error" in result
                      ? String(result.error)
                      : "归档操作未完成",
                  ),
                );
              else resolve(result);
            } catch {
              reject(new Error(stderr || "归档进程未返回有效结果"));
            }
          });
          child.stdin.end(
            JSON.stringify({
              ...input,
              base: config.baseDir,
              inventoryPaths: {
                logs: config.logsDir,
                attachments: config.attachmentsDir,
                database: config.dbPath,
              },
            }),
          );
        }),
      catch: (error) =>
        new StorageManagementError({
          message: error instanceof Error ? error.message : String(error),
        }),
    });
  });
  const inspect = Effect.fn("StorageManagement.inspect")(function* (input: StorageInspectInput) {
    return yield* call({ ...input, action: "inspect" }).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(StorageInspection)),
      Effect.mapError((error) => new StorageManagementError({ message: String(error) })),
    );
  });
  const manage = Effect.fn("StorageManagement.manage")(function* (input: StorageActionInput) {
    if (input.action === "execute") {
      const operation = yield* call({ ...input, action: "queue" }).pipe(
        Effect.flatMap(Schema.decodeUnknownEffect(StorageOperation)),
        Effect.mapError((error) => new StorageManagementError({ message: String(error) })),
      );
      if (operation.phase === "queued") {
        yield* cleanup
          .withMaintenanceLock(call(input))
          .pipe(Effect.uninterruptible, Effect.forkIn(scope));
      }
      return operation;
    }
    const work = input.action === "cancel" ? call(input) : cleanup.withMaintenanceLock(call(input));
    return yield* work.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(StorageOperation)),
      Effect.mapError((error) => new StorageManagementError({ message: String(error) })),
    );
  });
  return StorageManagement.of({ inspect, manage });
});
export const layer = Layer.effect(StorageManagement, make);
