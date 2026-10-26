import type { SidebarThreadSummary } from "./types";
import { inboxReason, inboxThreadKey, type InboxThread } from "./workbenchInbox";

export const INBOX_PREVIEW_LIMIT = 5;
type PresentationThread = InboxThread &
  Pick<SidebarThreadSummary, "updatedAt" | "pendingRequestCreatedAt">;
export function attentionReason(
  thread: InboxThread,
  acknowledged: Readonly<Record<string, string>>,
  visited?: string,
) {
  const reason = inboxReason(thread, visited);
  return reason === "运行失败" && acknowledged[inboxThreadKey(thread)] === thread.latestRun?.runId
    ? null
    : reason;
}
export function attentionTimestamp(thread: PresentationThread) {
  return thread.hasPendingApprovals || thread.hasPendingUserInput
    ? (thread.pendingRequestCreatedAt ??
        thread.latestRun?.requestedAt ??
        thread.latestRun?.startedAt ??
        thread.updatedAt)
    : (thread.latestRun?.completedAt ?? thread.updatedAt);
}
export function sortedAttentionThreads<T extends PresentationThread>(
  threads: readonly T[],
  acknowledged: Readonly<Record<string, string>>,
  visits: Readonly<Record<string, string>> = {},
) {
  const rank = (thread: T) =>
    ({ 待授权: 0, 待回答: 0, 运行失败: 1, 有新结果: 2 })[
      attentionReason(thread, acknowledged, visits[inboxThreadKey(thread)]) ?? "有新结果"
    ];
  return threads
    .filter(
      (thread) => attentionReason(thread, acknowledged, visits[inboxThreadKey(thread)]) !== null,
    )
    .toSorted(
      (a, b) =>
        rank(a) - rank(b) ||
        Date.parse(attentionTimestamp(a)) - Date.parse(attentionTimestamp(b)) ||
        inboxThreadKey(a).localeCompare(inboxThreadKey(b)),
    );
}
export function nextAttentionThread<T extends InboxThread>(
  threads: readonly T[],
  activeKey: string | null,
): T | null {
  if (threads.length === 0) return null;
  const index = threads.findIndex((thread) => inboxThreadKey(thread) === activeKey);
  return threads[(index + 1) % threads.length] ?? null;
}
export function attentionPage<T>(threads: readonly T[], expanded: boolean) {
  return {
    rows: expanded ? threads : threads.slice(0, INBOX_PREVIEW_LIMIT),
    hidden: expanded ? 0 : Math.max(0, threads.length - INBOX_PREVIEW_LIMIT),
  };
}
export function urgentThread(thread: InboxThread, acknowledged: Readonly<Record<string, string>>) {
  const reason = attentionReason(thread, acknowledged);
  return reason === "待授权" || reason === "待回答" || reason === "运行失败";
}
export function groupAttentionCounts(
  threads: readonly InboxThread[],
  acknowledged: Readonly<Record<string, string>>,
) {
  let requests = 0,
    errors = 0;
  for (const thread of threads) {
    const reason = attentionReason(thread, acknowledged);
    if (reason === "待授权" || reason === "待回答") requests++;
    else if (reason === "运行失败") errors++;
  }
  return { requests, errors };
}
export function sidebarPreviewThreads<T extends InboxThread>(
  threads: readonly T[],
  limit: number,
  acknowledged: Readonly<Record<string, string>>,
  activeKey: string | null,
) {
  return threads.filter(
    (thread, index) =>
      index < limit || inboxThreadKey(thread) === activeKey || urgentThread(thread, acknowledged),
  );
}
export function sidebarRelativeTime(timestamp: string, now = Date.now()) {
  const elapsed = Math.max(0, now - Date.parse(timestamp));
  if (!Number.isFinite(elapsed)) return "";
  if (elapsed < 60_000) return "刚刚";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}分`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}时`;
  return `${Math.floor(elapsed / 86_400_000)}天`;
}

export function attentionThreadLabel(
  thread: InboxThread & Pick<SidebarThreadSummary, "title">,
  threads: readonly (InboxThread & Pick<SidebarThreadSummary, "title">)[],
  reason: string | null,
) {
  const parent =
    thread.lineage.relationshipToParent === "subagent" && thread.lineage.parentThreadId
      ? threads.find(
          (candidate) =>
            candidate.environmentId === thread.environmentId &&
            candidate.id === thread.lineage.parentThreadId &&
            !candidate.deletedAt,
        )
      : null;
  return {
    title: parent?.title || thread.title || "未命名会话",
    detail: thread.lineage.relationshipToParent === "subagent" ? `子任务 · ${reason ?? ""}` : null,
  };
}
