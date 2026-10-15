import type {
  OrchestrationV2ThreadProjection,
  OrchestrationV2ProviderTurn,
} from "@t3tools/contracts";

/** Reports from another provider session do not describe the active session's context. */
export function latestContextUsage(
  projection: {
    readonly thread: Pick<OrchestrationV2ThreadProjection["thread"], "activeProviderThreadId">;
    readonly providerTurns: ReadonlyArray<
      Pick<OrchestrationV2ProviderTurn, "providerThreadId" | "tokenUsage">
    >;
  } | null,
) {
  if (!projection?.thread.activeProviderThreadId) return null;
  for (let index = projection.providerTurns.length - 1; index >= 0; index -= 1) {
    const turn = projection.providerTurns[index];
    if (
      turn?.providerThreadId === projection.thread.activeProviderThreadId &&
      turn.tokenUsage !== undefined
    )
      return turn.tokenUsage;
  }
  return null;
}
