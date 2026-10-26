import type {
  OrchestrationV2ThreadProjection,
  ServerProviderUsageLimits,
} from "@t3tools/contracts";

export function executionSnapshot(projection: OrchestrationV2ThreadProjection | null) {
  if (!projection) return null;
  // Queued selections are intent, not evidence that a provider ran them.
  const run = [...projection.runs].reverse().find((run) => run.startedAt !== null);
  const providerThread = projection.providerThreads.find(
    (thread) => thread.id === (run?.providerThreadId ?? projection.thread.activeProviderThreadId),
  );
  if (!providerThread) return null;
  const session = projection.providerSessions.find(
    (session) => session.id === providerThread.providerSessionId,
  );
  const reported = providerThread.nativeMetadata?.modelSelection;
  return {
    instanceId: providerThread.providerInstanceId,
    model: reported?.model ?? session?.model ?? null,
    options: reported?.options ?? [],
    requested: run?.modelSelection ?? projection.thread.modelSelection,
  };
}

export function quotaSnapshot(
  limits: ServerProviderUsageLimits | undefined,
  connected: boolean,
  now: number,
) {
  const stale =
    !connected ||
    !!limits?.unavailable ||
    !limits ||
    !Number.isFinite(Date.parse(limits.checkedAt)) ||
    now - Date.parse(limits.checkedAt) > 10 * 60_000;
  return {
    stale,
    checkedAt: limits?.checkedAt ?? null,
    windows: limits?.unavailable?.reason === "unsupported" ? [] : (limits?.windows ?? []),
  };
}

export function accountAlias(displayName: string | undefined): string | null {
  // Never fall back to auth.email, account labels, or an instance id that may be an email.
  return displayName && !/[@\r\n]|(?:sk-|bearer\s|token[=:])/i.test(displayName)
    ? displayName
    : null;
}
