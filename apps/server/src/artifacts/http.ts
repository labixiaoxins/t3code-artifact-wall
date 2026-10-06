import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { AuthOrchestrationReadScope } from "@t3tools/contracts";
import * as ServerConfig from "../config.ts";
import { assetFileResponse, authenticateRawRouteWithScope, isLoopbackHostname } from "../http.ts";
import * as ArtifactWall from "./ArtifactWall.ts";

const localRequest = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const url = HttpServerRequest.toURL(request);
  return (
    isLoopbackHostname(config.host ?? "127.0.0.1") &&
    Option.isSome(url) &&
    isLoopbackHostname(url.value.hostname) &&
    !request.headers["x-forwarded-for"]
  );
});
export const layer = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/api/artifact-wall/list",
    Effect.gen(function* () {
      if (!(yield* localRequest)) return HttpServerResponse.empty({ status: 403 });
      yield* authenticateRawRouteWithScope(AuthOrchestrationReadScope);
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = Option.getOrThrow(HttpServerRequest.toURL(request));
      const threadId = url.searchParams.get("threadId");
      const scope = url.searchParams.get("scope") ?? "thread";
      if (!threadId || threadId.length > 256 || !["thread", "project"].includes(scope))
        return HttpServerResponse.empty({ status: 400 });
      const wall = yield* ArtifactWall.ArtifactWall;
      const artifacts = yield* wall.list(threadId, scope as "thread" | "project");
      return HttpServerResponse.jsonUnsafe(
        { artifacts },
        { headers: { "cache-control": "no-store" } },
      );
    }).pipe(
      Effect.catchTags({
        EnvironmentAuthInvalidError: () =>
          Effect.succeed(HttpServerResponse.empty({ status: 401 })),
        EnvironmentScopeRequiredError: () =>
          Effect.succeed(HttpServerResponse.empty({ status: 403 })),
      }),
      Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 500 })),
    ),
  ),
  HttpRouter.add(
    "GET",
    "/api/artifact-wall/file/:id",
    Effect.gen(function* () {
      if (!(yield* localRequest)) return HttpServerResponse.empty({ status: 403 });
      const params = yield* HttpRouter.params;
      const request = yield* HttpServerRequest.HttpServerRequest;
      const wall = yield* ArtifactWall.ArtifactWall;
      const opened = yield* wall.open(params.id ?? "");
      if (!opened) return HttpServerResponse.empty({ status: 403 });
      return yield* assetFileResponse(
        {
          path: opened.artifact.path,
          file: opened.file,
          fileName: opened.artifact.name,
          ...(opened.artifact.extension === "mp4" ? { mimeType: "video/mp4" } : {}),
        },
        request.headers.range,
      );
    }).pipe(Effect.orElseSucceed(() => HttpServerResponse.empty({ status: 403 }))),
  ),
).pipe(HttpRouter.provideRequest(ArtifactWall.layer));
