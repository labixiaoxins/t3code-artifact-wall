import { backgroundWorkHoldsCompletion } from "@t3tools/shared/orchestrationV2PendingBackgroundWork";
import type { SidebarThreadSummary } from "./types";
import { buildSubtaskTree, subtaskThreadKey } from "./sidebarSubtasks";

export function activeWorkStatus(thread: SidebarThreadSummary): string | null {
  if (thread.deletedAt) return null;
  if (thread.hasPendingApprovals || thread.pendingSubagentRequest === "approval") return "待授权";
  if (thread.hasPendingUserInput || thread.pendingSubagentRequest === "user_input") return "待回答";
  const status = thread.runtime?.status;
  if (status === "preparing" || status === "starting") return "启动中";
  if (status === "queued") return "排队中";
  if (status === "running") return thread.blockedOnThreadWait ? "等待任务" : "工作中";
  if (status === "waiting") return "等待任务";
  if (backgroundWorkHoldsCompletion(thread.pendingBackgroundTasks ?? [])) return "等待后台任务";
  return null;
}

export function collectActiveWork(threads: readonly SidebarThreadSummary[]) {
  const tree = buildSubtaskTree(threads);
  const groups = new Map<
    string,
    { root: SidebarThreadSummary; children: SidebarThreadSummary[] }
  >();
  for (const thread of threads) {
    if (activeWorkStatus(thread) === null) continue;
    const root = tree.rootFor(thread);
    const key = subtaskThreadKey(root);
    let group = groups.get(key);
    if (!group) {
      group = { root, children: [] };
      groups.set(key, group);
    }
    if (subtaskThreadKey(thread) !== key) group.children.push(thread);
  }
  // Creation order stays stable when streaming updates change updatedAt.
  const order = (a: SidebarThreadSummary, b: SidebarThreadSummary) =>
    a.createdAt.localeCompare(b.createdAt) ||
    subtaskThreadKey(a).localeCompare(subtaskThreadKey(b));
  return [...groups.values()]
    .sort((a, b) => order(a.root, b.root))
    .map((group) => ({ ...group, children: group.children.sort(order) }));
}

export function activeWorkPreview(groups: ReturnType<typeof collectActiveWork>) {
  let childSlots = 5 - Math.min(3, groups.length);
  return groups.slice(0, 3).map((group) => {
    const children = group.children.slice(0, Math.min(2, childSlots));
    childSlots -= children.length;
    return { ...group, children };
  });
}
