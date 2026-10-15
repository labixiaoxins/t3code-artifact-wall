import { OrchestratorMcpFailure } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as ArtifactWall from "../../../artifacts/ArtifactWall.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { ArtifactToolkit } from "./tools.ts";

const failure = (error: ArtifactWall.ArtifactWallError | ArtifactWall.ArtifactCheckRejected) =>
  new OrchestratorMcpFailure({
    code: error._tag === "ArtifactCheckRejected" ? "invalid_request" : "orchestration_error",
    message: error.message,
  });

export const layer = McpToolAccess.toLayer(ArtifactToolkit, {
  artifact_list: McpToolAccess.readsAsCaller((input) =>
    Effect.gen(function* () {
      const scope = yield* McpInvocationContext.McpInvocationContext;
      const { thread } = yield* McpInvocationContext.requireThreadScope(scope, "artifact_list");
      const wall = yield* ArtifactWall.ArtifactWall;
      const artifacts = yield* wall.list(thread.threadId, "thread").pipe(Effect.mapError(failure));
      const offset = input.offset ?? 0,
        end = offset + (input.limit ?? 40);
      return {
        artifacts: artifacts.slice(offset, end),
        nextOffset: end < artifacts.length ? end : null,
      };
    }),
  ),
  artifact_record_check: McpToolAccess.writesThreads(
    () => [undefined],
    (input) =>
      Effect.gen(function* () {
        const scope = yield* McpInvocationContext.McpInvocationContext;
        const { thread } = yield* McpInvocationContext.requireThreadScope(
          scope,
          "artifact_record_check",
        );
        const wall = yield* ArtifactWall.ArtifactWall;
        return yield* wall
          .recordCheck({ ...input, threadId: thread.threadId })
          .pipe(Effect.mapError(failure));
      }),
  ),
});
