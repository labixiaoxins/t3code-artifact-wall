import type { ScopedProjectRef } from "@t3tools/contracts";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarThreadSummary } from "../../types";

export interface StickyProjectIdentity {
  readonly environmentId: string;
  readonly projectId: string;
}

export function stickyProjectKey(identity: StickyProjectIdentity): string {
  return `${identity.environmentId}:${identity.projectId}`;
}

export function areStickyIdentitiesEqual(
  a: StickyProjectIdentity,
  b: StickyProjectIdentity,
): boolean {
  return a.environmentId === b.environmentId && a.projectId === b.projectId;
}

export function isIdentityInList(
  list: ReadonlyArray<StickyProjectIdentity>,
  identity: StickyProjectIdentity,
): boolean {
  return list.some((item) => areStickyIdentitiesEqual(item, identity));
}

export function addStickyProjectIdentity(
  list: ReadonlyArray<StickyProjectIdentity>,
  identity: StickyProjectIdentity,
): ReadonlyArray<StickyProjectIdentity> {
  if (isIdentityInList(list, identity)) {
    return list;
  }
  return [...list, identity];
}

export function removeStickyProjectIdentity(
  list: ReadonlyArray<StickyProjectIdentity>,
  identity: StickyProjectIdentity,
): ReadonlyArray<StickyProjectIdentity> {
  return list.filter((item) => !areStickyIdentitiesEqual(item, identity));
}

export function moveStickyProjectIdentity(
  list: ReadonlyArray<StickyProjectIdentity>,
  index: number,
  direction: "up" | "down",
): ReadonlyArray<StickyProjectIdentity> {
  if (direction === "up") {
    if (index <= 0 || index >= list.length) return list;
    const next = [...list];
    const prevItem = next[index - 1]!;
    next[index - 1] = next[index]!;
    next[index] = prevItem;
    return next;
  } else {
    if (index < 0 || index >= list.length - 1) return list;
    const next = [...list];
    const nextItem = next[index + 1]!;
    next[index + 1] = next[index]!;
    next[index] = nextItem;
    return next;
  }
}

/**
 * Checks if a project snapshot (or any of its logical member projects) is in the sticky list.
 */
export function isProjectSticky(
  identities: ReadonlyArray<StickyProjectIdentity>,
  project: {
    environmentId: string;
    id: string;
    memberProjectRefs?: ReadonlyArray<ScopedProjectRef>;
  },
): boolean {
  if (identities.some((id) => id.environmentId === project.environmentId && id.projectId === project.id)) {
    return true;
  }
  if (project.memberProjectRefs && project.memberProjectRefs.length > 0) {
    return project.memberProjectRefs.some((ref) =>
      identities.some((id) => id.environmentId === ref.environmentId && id.projectId === ref.projectId),
    );
  }
  return false;
}

export interface ResolvedStickyProjectItem {
  readonly identity: StickyProjectIdentity;
  readonly key: string;
  readonly isAvailable: boolean;
  readonly title: string;
  readonly snapshot?: SidebarProjectSnapshot;
  readonly recentThreads: readonly SidebarThreadSummary[];
  readonly totalThreadCount: number;
  readonly isDefaultExpanded: boolean;
}

/**
 * Resolves sticky identities against current active sidebar projects.
 * - Stable environmentId+projectId identity is preserved.
 * - Logical project membership is respected: renames in project are automatically reflected.
 * - Disconnected or deleted projects are flagged as isAvailable: false.
 * - For available projects, loads up to 3 recent unarchived threads.
 * - Active project defaults to expanded, others collapsed.
 */
export function resolveStickyProjects(input: {
  identities: ReadonlyArray<StickyProjectIdentity>;
  sidebarProjects: ReadonlyArray<SidebarProjectSnapshot>;
  threadsByProjectKey: Map<string, SidebarThreadSummary[]>;
  activeProjectKey?: string | null;
}): ResolvedStickyProjectItem[] {
  const { identities, sidebarProjects, threadsByProjectKey, activeProjectKey } = input;

  const seenProjects = new Set<string>();
  return identities.map((identity) => {
    const key = stickyProjectKey(identity);
    // Find matching logical project snapshot by primary id or any member project ref
    const snapshot = sidebarProjects.find((p) => {
      if (p.environmentId === identity.environmentId && p.id === identity.projectId) {
        return true;
      }
      return p.memberProjectRefs?.some(
        (ref) => ref.environmentId === identity.environmentId && ref.projectId === identity.projectId,
      );
    });

    if (!snapshot) {
      return {
        identity,
        key,
        isAvailable: false,
        title: "不可用项目",
        recentThreads: [],
        totalThreadCount: 0,
        isDefaultExpanded: false,
      };
    }

    if (seenProjects.has(snapshot.projectKey)) return null;
    seenProjects.add(snapshot.projectKey);
    const allThreads = threadsByProjectKey.get(snapshot.projectKey) ?? [];
    const unarchivedThreads = allThreads.filter((thread) => !thread.archivedAt);
    // Sort recent threads by last activity descending (updatedAt > createdAt)
    const sortedThreads = [...unarchivedThreads].sort((a, b) => {
      const timeA = new Date(a.updatedAt ?? a.createdAt).getTime();
      const timeB = new Date(b.updatedAt ?? b.createdAt).getTime();
      return timeB - timeA;
    });

    const recentThreads = sortedThreads.slice(0, 3);
    const isDefaultExpanded = Boolean(activeProjectKey && snapshot.projectKey === activeProjectKey);

    return {
      identity,
      key,
      isAvailable: true,
      title: snapshot.displayName || snapshot.title,
      snapshot,
      recentThreads,
      totalThreadCount: unarchivedThreads.length,
      isDefaultExpanded,
    };
  }).filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Pure search filter for archived threads by title.
 */
export function filterArchivedGroupsByTitle<
  TThread extends { title: string },
  TGroup extends { threads: readonly TThread[] },
>(groups: readonly TGroup[], query: string): TGroup[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) {
    return [...groups];
  }
  return groups
    .map((group) => ({
      ...group,
      threads: group.threads.filter((t) => t.title.toLowerCase().includes(trimmed)),
    }))
    .filter((group) => group.threads.length > 0);
}

/** Move the whole visible logical project, retaining every physical identity in its group. */
export function moveStickyProjectGroup(
  list: ReadonlyArray<StickyProjectIdentity>,
  groupKeys: ReadonlyArray<string>,
  key: string,
  direction: "up" | "down",
): ReadonlyArray<StickyProjectIdentity> {
  if (list.length !== groupKeys.length) return list;
  const order = [...new Set(groupKeys)];
  const from = order.indexOf(key), to = from + (direction === "up" ? -1 : 1);
  if (from < 0 || to < 0 || to >= order.length) return list;
  [order[from], order[to]] = [order[to]!, order[from]!];
  return order.flatMap((group) => list.filter((_, index) => groupKeys[index] === group));
}
