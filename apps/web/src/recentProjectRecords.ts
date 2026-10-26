import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";
import type { SidebarThreadSummary } from "./types";

export function recentProjectRecords(
  projects: readonly SidebarProjectSnapshot[],
  threads: readonly SidebarThreadSummary[],
  limit = 4,
) {
  const projectForThread = new Map<string, SidebarProjectSnapshot>();
  for (const project of projects) {
    if (["自动化与测试", "其他项目"].includes(project.displayName)) continue;
    for (const key of project.providerThreadKeys ?? []) projectForThread.set(key, project);
  }
  const ordered = threads
    .filter(
      (thread) =>
        thread.archivedAt === null &&
        thread.modelSelection.model !== "codex-auto-review" &&
        !/^(自动审批|生图执行记录|历史记录 ·|历史会话 ·|协作记录｜)/.test(thread.title),
    )
    .toSorted(
      (a, b) =>
        Date.parse(b.latestUserMessageAt ?? b.createdAt) -
        Date.parse(a.latestUserMessageAt ?? a.createdAt),
    );
  const seen = new Set<string>();
  const result: {
    project: SidebarProjectSnapshot;
    thread: SidebarThreadSummary;
    activityAt: string;
  }[] = [];
  for (const thread of ordered) {
    const project = projectForThread.get(
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    );
    if (!project) continue;
    const key = project.sourceProjectKey ?? project.projectKey;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ project, thread, activityAt: thread.latestUserMessageAt ?? thread.createdAt });
    if (result.length === limit) break;
  }
  return result;
}
