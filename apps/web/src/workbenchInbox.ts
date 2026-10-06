import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { backgroundWorkHoldsCompletion } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import type { SidebarThreadSummary } from "./types";

export type InboxThread = Pick<
  SidebarThreadSummary,
  | "environmentId"
  | "id"
  | "archivedAt"
  | "deletedAt"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "latestRun"
  | "runtime"
  | "lastVisitedAt"
  | "lineage"
  | "settledAt"
  | "pendingBackgroundTasks"
>;
export const inboxThreadKey = (thread: Pick<InboxThread, "environmentId" | "id">) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
export function inboxReason(
  thread: InboxThread,
  visited?: string,
): "待授权" | "待回答" | "运行失败" | "有新结果" | null {
  if (thread.deletedAt) return null;
  if (thread.hasPendingApprovals) return "待授权";
  if (thread.hasPendingUserInput) return "待回答";
  if (thread.archivedAt || thread.lineage.relationshipToParent === "subagent") return null;
  // A previous failed run must not reappear while a replacement run is in progress.
  const active = ["preparing", "queued", "starting", "running", "waiting"].includes(
    thread.runtime?.status ?? "",
  );
  if (active || backgroundWorkHoldsCompletion(thread.pendingBackgroundTasks)) return null;
  const completed = thread.latestRun?.completedAt;
  if (
    thread.latestRun?.status === "failed" &&
    (!thread.settledAt || Date.parse(completed ?? "") > Date.parse(thread.settledAt))
  )
    return "运行失败";
  const watermark = thread.lastVisitedAt === undefined ? visited : thread.lastVisitedAt;
  if (
    thread.latestRun?.status === "completed" &&
    completed &&
    watermark &&
    Date.parse(completed) > Date.parse(watermark)
  )
    return "有新结果";
  return null;
}
export function resumableThreads<T extends InboxThread>(
  threads: readonly T[],
  visits: Readonly<Record<string, string>>,
  saved: Readonly<Record<string, string>>,
) {
  return threads
    .filter(
      (thread) =>
        !thread.deletedAt &&
        !thread.archivedAt &&
        (saved[inboxThreadKey(thread)] ||
          (thread.lineage.relationshipToParent !== "subagent" && visits[inboxThreadKey(thread)])),
    )
    .toSorted(
      (a, b) =>
        Number(Boolean(saved[inboxThreadKey(b)])) - Number(Boolean(saved[inboxThreadKey(a)])) ||
        Date.parse(visits[inboxThreadKey(b)] ?? saved[inboxThreadKey(b)] ?? "1970-01-01") -
          Date.parse(visits[inboxThreadKey(a)] ?? saved[inboxThreadKey(a)] ?? "1970-01-01"),
    );
}

// Resume history is distinct from unread watermarks: mark-unread must not erase a visit.
export function resumeVisits(
  threads: readonly InboxThread[],
  local: Readonly<Record<string, string>>,
  recent: Readonly<Record<string, string>>,
) {
  const result: Record<string, string> = { ...local };
  for (const thread of threads) {
    const key = inboxThreadKey(thread);
    for (const timestamp of [thread.lastVisitedAt, recent[key]]) {
      if (
        timestamp &&
        Number.isFinite(Date.parse(timestamp)) &&
        (!result[key] || Date.parse(timestamp) > Date.parse(result[key]))
      )
        result[key] = timestamp;
    }
  }
  return result;
}
