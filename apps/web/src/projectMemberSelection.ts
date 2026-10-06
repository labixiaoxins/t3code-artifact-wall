import type { ContextMenuItem } from "@t3tools/contracts";
import type { SidebarProjectGroupMember } from "./sidebarProjectGrouping";
import type { SidebarThreadSummary } from "./types";

type Member = Pick<
  SidebarProjectGroupMember,
  "id" | "environmentId" | "physicalProjectKey" | "title" | "workspaceRoot" | "environmentLabel"
>;
type Usage = Pick<SidebarThreadSummary, "projectId" | "environmentId" | "latestUserMessageAt">;
export const memberPreferenceKey = (categoryKey: string) =>
  `t3code:new-thread-member:${categoryKey}`;
export function compactWorkspacePath(path: string) {
  return path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
}
export function isDatedCodexWorkspace(path: string) {
  return /^~\/Documents\/Codex\/\d{4}-\d{2}-\d{2}(?:\/|$)/.test(compactWorkspacePath(path));
}
export function recentProjectMembers<T extends Member>(
  members: readonly T[],
  threads: readonly Usage[],
): T[] {
  const usage = new Map<string, number>();
  for (const thread of threads) {
    const at = Date.parse(thread.latestUserMessageAt ?? "");
    if (!Number.isFinite(at)) continue;
    const key = JSON.stringify([thread.environmentId, thread.projectId]);
    usage.set(key, Math.max(usage.get(key) ?? 0, at));
  }
  return members.toSorted(
    (a, b) =>
      (usage.get(JSON.stringify([b.environmentId, b.id])) ?? 0) -
      (usage.get(JSON.stringify([a.environmentId, a.id])) ?? 0),
  );
}
export function defaultProjectMember<T extends Member>(
  members: readonly T[],
  threads: readonly Usage[],
  remembered: string | null,
): T | undefined {
  const saved = members.find((member) => member.physicalProjectKey === remembered);
  if (saved) return saved;
  const recent = recentProjectMembers(members, threads);
  const used = recent.find((member) =>
    threads.some(
      (thread) =>
        thread.environmentId === member.environmentId &&
        thread.projectId === member.id &&
        Number.isFinite(Date.parse(thread.latestUserMessageAt ?? "")),
    ),
  );
  return (
    used ?? members.find((member) => !isDatedCodexWorkspace(member.workspaceRoot)) ?? members[0]
  );
}
export function projectMemberMenu(
  members: readonly Member[],
  threads: readonly Usage[],
): ContextMenuItem[] {
  const multipleEnvironments = new Set(members.map((member) => member.environmentId)).size > 1;
  const item = (member: Member): ContextMenuItem => ({
    id: member.physicalProjectKey,
    label: `${member.title}${multipleEnvironments && member.environmentLabel ? ` · ${member.environmentLabel}` : ""} — ${compactWorkspacePath(member.workspaceRoot)}`,
  });
  const sorted = recentProjectMembers(members, threads);
  const current = sorted.filter((member) => !isDatedCodexWorkspace(member.workspaceRoot));
  const history = sorted.filter((member) => isDatedCodexWorkspace(member.workspaceRoot));
  return [
    ...current.map(item),
    ...(history.length
      ? [
          {
            id: "historical-members",
            label: `更早的历史目录（${history.length}）`,
            separatorBefore: current.length > 0,
            children: history.map(item),
          },
        ]
      : []),
  ];
}
export function readDefaultMember(categoryKey: string): string | null {
  try {
    return localStorage.getItem(memberPreferenceKey(categoryKey));
  } catch {
    return null;
  }
}
export function rememberDefaultMember(categoryKey: string, member: Member): boolean {
  try {
    localStorage.setItem(memberPreferenceKey(categoryKey), member.physicalProjectKey);
    return true;
  } catch {
    return false;
  }
}
