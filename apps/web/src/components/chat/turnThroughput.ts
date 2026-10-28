import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { latestProviderTurnForAttempt } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

const terminal = new Set(["completed", "failed", "cancelled", "interrupted", "rolled_back"]);
const active = new Set(["pending", "running", "waiting"]);
const tools = new Set([
  "command_execution",
  "dynamic_tool",
  "file_change",
  "file_search",
  "web_search",
  "subagent",
]);

/** Same statuses client-runtime treats as owning live provider work (threadExecution.ts). */
const working = new Set(["preparing", "starting", "running", "waiting"]);

const awaitingUserTypes = new Set(["approval_request", "user_input_request", "secret_request"]);

/**
 * Follows the run that owns live work. With none, the newest run is shown frozen only if it
 * has finished and nothing is queued behind it (a paused queue after Stop, a failed call or
 * a usage limit must not look like a ticking "排队中"). Completed readings remain available
 * in on-demand details. Never divide the context-window counter by elapsed time: it is a
 * last-response snapshot.
 */
export function selectTurnThroughput(projection: ThreadStructure) {
  const newest = (runs: typeof projection.runs) =>
    runs.reduce<(typeof projection.runs)[number] | undefined>(
      (latest, r) => (!latest || r.ordinal > latest.ordinal ? r : latest),
      undefined,
    );
  const latest = newest(projection.runs);
  const run =
    newest(projection.runs.filter((r) => working.has(r.status))) ??
    (latest && terminal.has(latest.status) && latest.completedAt ? latest : undefined);
  if (!run) return null;
  const attempt = projection.attempts
    .filter((a) => a.runId === run.id)
    .reduce<(typeof projection.attempts)[number] | undefined>(
      (latest, a) => (!latest || a.attemptOrdinal > latest.attemptOrdinal ? a : latest),
      undefined,
    );
  const turn = latestProviderTurnForAttempt(
    projection.providerTurns,
    run.activeAttemptId ?? attempt?.id,
  );
  const running = !terminal.has(run.status);
  const sampling = running && turn?.status === "running";
  const start = turn?.startedAt ?? run.startedAt ?? run.requestedAt;
  const startMs = DateTime.toEpochMillis(start);
  const end = turn?.completedAt ?? run.completedAt;
  const usage = turn?.turnTokenUsage;
  const count = usage?.usageStatus !== "unavailable" ? usage?.outputTokens : undefined;
  const outputTokens =
    typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : null;
  // The context-window snapshot time only dates a usage report when turn usage exists.
  const reportAt = outputTokens === null ? undefined : turn?.tokenUsage?.updatedAt;
  const reportMs = reportAt ? Date.parse(reportAt) : NaN;
  let lastActivityMs = startMs;
  let lastType: string | null = null;
  let lastActiveMs = -Infinity;
  // Only this run/turn's activity: inherited history and child agents cannot impersonate this model.
  for (const item of projection.turnItems) {
    if (item.runId !== run.id || (turn && item.providerTurnId !== turn.id)) continue;
    const updated = DateTime.toEpochMillis("updatedAt" in item ? item.updatedAt : start);
    if (item.type !== "user_message") lastActivityMs = Math.max(lastActivityMs, updated);
    if (active.has(item.status) && updated >= lastActiveMs) {
      lastActiveMs = updated;
      lastType = item.type;
    }
  }
  if (Number.isFinite(reportMs) && reportMs >= startMs)
    lastActivityMs = Math.max(lastActivityMs, reportMs);
  const terminalLabels: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消",
    interrupted: "已中断",
    rolled_back: "已回退",
  };
  let phase = "等待模型活动";
  if (!running) phase = terminalLabels[run.status] ?? run.status;
  else if (run.status === "queued") phase = "排队中";
  else if (run.status === "preparing" || run.status === "starting") phase = "准备中";
  else if (lastType !== null && awaitingUserTypes.has(lastType)) phase = "等待你操作";
  else if (
    projection.turnItems.some(
      (item) => item.runId === run.id && item.type === "compaction" && active.has(item.status),
    )
  )
    phase = "压缩上下文中";
  else if (lastType && tools.has(lastType)) phase = "执行工具 / 子任务";
  else if (lastType === "reasoning") phase = "思考中";
  else if (lastType === "assistant_message" || lastType === "proposed_plan") phase = "输出中";
  else if (run.status === "waiting") phase = "等待中";
  else if (turn && terminal.has(turn.status)) phase = "等待后续 / 收尾";
  return {
    key: `${run.id}:${turn?.id ?? "pending"}`,
    // Run selection is fixed at dispatch; the composer's selection can already be the next model.
    model: run.modelSelection.model,
    provider: String(run.providerInstanceId),
    running,
    sampling,
    phase,
    startMs,
    endMs: end ? DateTime.toEpochMillis(end) : null,
    outputTokens,
    partial: usage?.usageStatus === "partial",
    // Waiting on the user or still preparing is not model silence; no "无新活动" timer then.
    quietApplies:
      running &&
      run.status !== "preparing" &&
      run.status !== "starting" &&
      !(lastType !== null && awaitingUserTypes.has(lastType)),
    reportMs: Number.isFinite(reportMs) && reportMs >= startMs ? reportMs : null,
    lastActivityMs,
  };
}
export type TurnThroughputSnapshot = NonNullable<ReturnType<typeof selectTurnThroughput>>;

export function throughputReading(snapshot: TurnThroughputSnapshot, now: number) {
  const end = snapshot.endMs ?? now;
  const elapsedMs = Math.max(0, end - snapshot.startMs);
  // Partial counters are lower bounds until the next provider report, never inferred from characters.
  const rate =
    snapshot.outputTokens !== null && elapsedMs >= 1000
      ? snapshot.outputTokens / (elapsedMs / 1000)
      : null;
  return {
    rate,
    elapsedMs,
    quietMs: Math.max(0, end - snapshot.lastActivityMs),
    reportAgeMs: snapshot.reportMs === null ? null : Math.max(0, end - snapshot.reportMs),
  };
}
export function formatThroughputDuration(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
