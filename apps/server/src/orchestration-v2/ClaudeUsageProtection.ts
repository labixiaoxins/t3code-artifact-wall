import {
  ProviderInstanceId,
  type ServerProviderUsageLimits,
  type ThreadId,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Semaphore from "effect/Semaphore";
import * as SqlClient from "effect/sql/SqlClient";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as ProviderRegistry from "../provider/ProviderRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";

export const QUOTA_FRESH_MS = 120_000;
export function quotaStage(limits: ServerProviderUsageLimits | undefined, now: number) {
  if (
    !limits ||
    limits.unavailable ||
    !Number.isFinite(Date.parse(limits.checkedAt)) ||
    now - Date.parse(limits.checkedAt) > QUOTA_FRESH_MS ||
    Date.parse(limits.checkedAt) > now + 5000
  )
    return { stage: "unknown" as const, key: "unknown" };
  const windows = limits.windows.filter(
    (w) =>
      (w.id === "five_hour" || w.id === "seven_day") &&
      Number.isFinite(w.usedPercent) &&
      w.usedPercent >= 0 &&
      w.usedPercent <= 100 &&
      w.resetsAt &&
      Date.parse(w.resetsAt) > now,
  );
  if (!windows.some((w) => w.id === "five_hour"))
    return { stage: "unknown" as const, key: "unknown" };
  const w = windows.reduce((a, b) => (a.usedPercent >= b.usedPercent ? a : b));
  return {
    stage:
      w.usedPercent >= 90
        ? ("finish" as const)
        : w.usedPercent >= 80
          ? ("warn" as const)
          : ("ready" as const),
    key: `${w.id}:${w.resetsAt}`,
    usedPercent: w.usedPercent,
  };
}

export interface GuardWork {
  readonly threadId: string;
  readonly runId: string;
  readonly instanceId: string;
  readonly status: string;
  readonly requestedAt: string;
}
export function taskFamily(id: string, parents: ReadonlyMap<string, string>): string {
  const seen = new Set<string>();
  while (parents.has(id) && !seen.has(id)) {
    seen.add(id);
    id = parents.get(id)!;
  }
  return id;
}
export function accountHasCapacity(
  threadId: string,
  work: readonly GuardWork[],
  parents: ReadonlyMap<string, string>,
) {
  const family = taskFamily(threadId, parents);
  const active = work.filter((w) =>
    ["preparing", "starting", "running", "waiting"].includes(w.status),
  );
  // Descendants must be allowed to finish work their active parent is waiting for.
  if (active.length) return active.every((w) => taskFamily(w.threadId, parents) === family);
  const first = work
    .filter((w) => w.status === "queued")
    .toSorted(
      (a, b) => a.requestedAt.localeCompare(b.requestedAt) || a.runId.localeCompare(b.runId),
    )[0];
  return first === undefined || taskFamily(first.threadId, parents) === family;
}

export class ClaudeUsageProtection extends Context.Service<
  ClaudeUsageProtection,
  {
    readonly enabled: (instanceId: string) => Effect.Effect<boolean>;
    readonly mayStart: (threadId: ThreadId, instanceId: string) => Effect.Effect<boolean>;
    readonly activeNotices: Effect.Effect<
      readonly { work: GuardWork; stage: "warn" | "finish"; key: string; usedPercent: number }[]
    >;
    readonly refresh: Effect.Effect<void>;
    readonly withStartLock: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>;
  }
>()("t3/orchestration-v2/ClaudeUsageProtection") {}

const make = Effect.gen(function* () {
  const settings = yield* ServerSettings.ServerSettingsService;
  const registry = Option.getOrUndefined(
    yield* Effect.serviceOption(ProviderRegistry.ProviderRegistry),
  );
  const sql = yield* SqlClient.SqlClient;
  const path = yield* Path.Path;
  const home = yield* HostProcess.HomeDirectory;
  const lock = yield* Semaphore.make(1);
  const accounts = Effect.gen(function* () {
    const s = yield* settings.getSettings.pipe(Effect.orDie);
    const result = new Map<string, { account: string; enabled: boolean }>();
    for (const [id, p] of Object.entries(s.providerInstances)) {
      if (p.driver !== "claudeAgent") continue;
      const cfg = p.config as { homePath?: string; usageProtection?: boolean } | undefined;
      const h = cfg?.homePath?.trim() || path.join(home, ".claude");
      result.set(id, {
        account: path.resolve(h.startsWith("~/") ? path.join(home, h.slice(2)) : h),
        enabled: cfg?.usageProtection === true,
      });
    }
    // Aliases for one account share its protection, even if only one alias enables it.
    for (const entry of result.values())
      entry.enabled ||= [...result.values()].some((x) => x.account === entry.account && x.enabled);
    return result;
  });
  const enabled = Effect.fn("ClaudeUsageProtection.enabled")(function* (id: string) {
    return (yield* accounts).get(id)?.enabled === true;
  });
  const work = sql<GuardWork>`SELECT r.thread_id AS threadId, r.run_id AS runId,
    r.provider_instance_id AS instanceId, r.status, r.requested_at AS requestedAt
    FROM orchestration_v2_projection_runs r JOIN orchestration_v2_projection_threads t ON t.thread_id=r.thread_id
    WHERE r.status IN ('preparing','starting','running','waiting','queued')
    AND t.deleted_at IS NULL AND t.archived_at IS NULL
    AND (r.status != 'queued' OR json_extract(r.payload_json, '$.queueHeld') IS NOT 1)`.pipe(
    Effect.orDie,
  );
  const quota = Effect.fn("ClaudeUsageProtection.quota")(function* (id: string) {
    const providers = registry ? yield* registry.getProviders : [];
    const now = yield* Clock.currentTimeMillis;
    return quotaStage(providers.find((p) => p.instanceId === id)?.usageLimits, now);
  });
  const mayStart = Effect.fn("ClaudeUsageProtection.mayStart")(function* (
    threadId: ThreadId,
    id: string,
  ) {
    const map = yield* accounts;
    const account = map.get(id);
    if (!account?.enabled) return true;
    const stage = yield* quota(id);
    if (stage.stage === "unknown" || stage.stage === "finish") return false;
    const rows = yield* sql<{ id: string; parent: string | null }>`SELECT thread_id AS id,
      CASE WHEN json_extract(payload_json,'$.lineage.relationshipToParent')='subagent'
      THEN json_extract(payload_json,'$.lineage.parentThreadId') ELSE NULL END AS parent
      FROM orchestration_v2_projection_threads`.pipe(Effect.orDie);
    const parents = new Map(rows.flatMap((r) => (r.parent ? [[r.id, r.parent] as const] : [])));
    return accountHasCapacity(
      threadId,
      (yield* work).filter((w) => map.get(w.instanceId)?.account === account.account),
      parents,
    );
  });
  const activeNotices = Effect.gen(function* () {
    const map = yield* accounts;
    const notices: {
      work: GuardWork;
      stage: "warn" | "finish";
      key: string;
      usedPercent: number;
    }[] = [];
    for (const w of yield* work) {
      if (w.status !== "running" || !map.get(w.instanceId)?.enabled) continue;
      const q = yield* quota(w.instanceId);
      if (q.stage === "warn" || q.stage === "finish")
        notices.push({ work: w, stage: q.stage, key: q.key, usedPercent: q.usedPercent });
    }
    return notices;
  });
  let lastRefresh = -Infinity;
  const refresh = Effect.gen(function* () {
    if ((yield* work).length === 0) return;
    const now = yield* Clock.currentTimeMillis;
    if (now - lastRefresh < 60_000) return;
    lastRefresh = now;
    for (const [id, c] of yield* accounts)
      if (c.enabled && registry) yield* registry.refreshInstance(ProviderInstanceId.make(id));
  });
  return ClaudeUsageProtection.of({
    enabled,
    mayStart,
    activeNotices,
    refresh,
    withStartLock: lock.withPermits(1),
  });
});
export const layer = Layer.effect(ClaudeUsageProtection, make);
