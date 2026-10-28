import { Worker } from "node:worker_threads";
import * as Path from "effect/Path";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { OrchestrationSearchThreadsResult } from "@t3tools/contracts";
import * as ServerConfig from "../config.ts";
export class SpotlightSearchError extends Schema.TaggedError<SpotlightSearchError>()(
  "SpotlightSearchError",
  { message: Schema.String },
) {}
export class SpotlightSearch extends Context.Service<
  SpotlightSearch,
  {
    readonly search: (
      query: string,
      limit: number,
    ) => Effect.Effect<OrchestrationSearchThreadsResult, SpotlightSearchError>;
  }
>()("t3/orchestration-v2/SpotlightSearch") {}
export const layer = Layer.effect(
  SpotlightSearch,
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const path = yield* Path.Path;
    let worker: Worker | undefined;
    let serial = 0;
    const pending = new Map<
      number,
      { resolve: (v: unknown) => void; reject: (e: Error) => void }
    >();
    const stop = (error: Error) => {
      for (const p of pending.values()) p.reject(error);
      pending.clear();
      worker = undefined;
    };
    yield* Effect.addFinalizer(() =>
      Effect.promise(async () => {
        const current = worker;
        stop(new SpotlightSearchError({ message: "Search stopped" }));
        await current?.terminate();
      }),
    );
    return SpotlightSearch.of({
      search: Effect.fn("SpotlightSearch.search")(function* (query: string, limit: number) {
        const raw = yield* Effect.tryPromise({
          try: () =>
            new Promise<unknown>((resolve, reject) => {
              if (!worker) {
                const development = import.meta.url.endsWith(".ts");
                worker = new Worker(
                  new URL(
                    development ? "../spotlight-search-worker.ts" : "./spotlight-search-worker.mjs",
                    import.meta.url,
                  ),
                  {
                    workerData: {
                      dbPath: config.dbPath,
                      cachePath: path.join(config.providerStatusCacheDir, "spotlight-v1.sqlite"),
                      aliasesPath: path.join(config.stateDir, "search-aliases.json"),
                    },
                  },
                );
                const current = worker;
                worker.on(
                  "message",
                  (message: { id: number; matches?: unknown; error?: string }) => {
                    const p = pending.get(message.id);
                    if (!p) return;
                    pending.delete(message.id);
                    message.error
                      ? p.reject(new SpotlightSearchError({ message: message.error }))
                      : p.resolve({ matches: message.matches });
                  },
                );
                worker.on("error", () => {
                  if (worker === current)
                    stop(new SpotlightSearchError({ message: "本地搜索暂不可用" }));
                });
                worker.on("exit", () => {
                  if (worker === current)
                    stop(new SpotlightSearchError({ message: "本地搜索已停止" }));
                });
              }
              const id = ++serial;
              pending.set(id, { resolve, reject });
              worker.postMessage({ id, query, limit });
            }),
          catch: (e) =>
            Schema.is(SpotlightSearchError)(e)
              ? e
              : new SpotlightSearchError({ message: "本地搜索失败" }),
        });
        return yield* Schema.decodeUnknownEffect(OrchestrationSearchThreadsResult)(raw).pipe(
          Effect.mapError(() => new SpotlightSearchError({ message: "Invalid search response" })),
        );
      }),
    });
  }),
);
