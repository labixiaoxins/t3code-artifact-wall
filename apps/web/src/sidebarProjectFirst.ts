import { useSyncExternalStore } from "react";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";

export type SidebarGrouping = "project" | "model";
export interface PinnedProject {
  readonly key: string;
  readonly at: number;
}

export const SIDEBAR_GROUPING_STORAGE_KEY = "t3code:sidebar-grouping:v1";
export const SIDEBAR_PINNED_STORAGE_KEY = "t3code:sidebar-pinned-projects:v1";
/** Marks a merged project row: threads from every model, instead of one model's slice. */
export const PROJECT_FIRST_LABEL = "项目";
export const RECENT_PROJECT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export function isProjectFirst(project: Pick<SidebarProjectSnapshot, "providerLabel">): boolean {
  return project.providerLabel === PROJECT_FIRST_LABEL;
}

export function parseSidebarGrouping(raw: string | null): SidebarGrouping {
  return raw === "model" ? "model" : "project";
}

export function parsePinnedProjects(raw: string | null): readonly PinnedProject[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    return parsed.flatMap((entry): PinnedProject[] => {
      const key = (entry as { key?: unknown } | null)?.key;
      const at = (entry as { at?: unknown } | null)?.at;
      if (typeof key !== "string" || key.length === 0 || seen.has(key)) return [];
      seen.add(key);
      return [{ key, at: typeof at === "number" && Number.isFinite(at) ? at : 0 }];
    });
  } catch {
    return [];
  }
}

export function togglePinnedProject(
  pinned: readonly PinnedProject[],
  key: string,
  now: number,
): readonly PinnedProject[] {
  return pinned.some((entry) => entry.key === key)
    ? pinned.filter((entry) => entry.key !== key)
    : [...pinned, { key, at: now }];
}

/** One row per source project (workspace collection), carrying the threads of every model. */
export function mergeSnapshotsByProject(
  snapshots: readonly SidebarProjectSnapshot[],
): SidebarProjectSnapshot[] {
  const merged = new Map<string, SidebarProjectSnapshot>();
  for (const snapshot of snapshots) {
    // Automation collections are built once per model; they are one project to the user.
    const source = snapshot.sourceProjectKey ?? snapshot.projectKey;
    const key = source.includes('"automation-collection"')
      ? JSON.stringify(["project-first-automation", snapshot.environmentId, snapshot.displayName])
      : source;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        ...snapshot,
        projectKey: JSON.stringify(["project-first", key]),
        sourceProjectKey: snapshot.sourceProjectKey ?? snapshot.projectKey,
        providerLabel: PROJECT_FIRST_LABEL,
        providerThreadKeys: new Set(snapshot.providerThreadKeys),
      });
      continue;
    }
    const keys = current.providerThreadKeys as Set<string>;
    for (const threadKey of snapshot.providerThreadKeys ?? []) keys.add(threadKey);
    const members = new Map(
      [...current.memberProjects, ...snapshot.memberProjects].map(
        (member) => [member.physicalProjectKey, member] as const,
      ),
    );
    const refs = new Map(
      [...current.memberProjectRefs, ...snapshot.memberProjectRefs].map(
        (ref) => [JSON.stringify(ref), ref] as const,
      ),
    );
    merged.set(key, {
      ...current,
      memberProjects: [...members.values()],
      memberProjectRefs: [...refs.values()],
      groupedProjectCount: members.size,
    });
  }
  return [...merged.values()];
}

/** Pin key that survives the merge: the source project, not the per-model slice. */
export function projectPinKey(project: SidebarProjectSnapshot): string {
  return project.sourceProjectKey ?? project.projectKey;
}

// Catch-all collections stay last in their section, as in the model view.
const isSecondaryProject = (project: Pick<SidebarProjectSnapshot, "displayName">) =>
  project.displayName === "自动化与测试" || project.displayName === "其他项目";

export interface ProjectSections {
  readonly pinned: SidebarProjectSnapshot[];
  readonly recent: SidebarProjectSnapshot[];
  readonly more: SidebarProjectSnapshot[];
}

/**
 * Pinned first (oldest pin first), then projects active in the last 14 days (the incoming order
 * is kept, so the sidebar's own sort order still decides), then the quiet ones under "more".
 * A project without any thread is not quiet, it is new: it stays in "recent".
 */
export function partitionProjects(input: {
  readonly projects: readonly SidebarProjectSnapshot[];
  readonly pinned: readonly PinnedProject[];
  readonly lastActivityByKey: ReadonlyMap<string, number>;
  readonly now: number;
  readonly sortByActivity: boolean;
}): ProjectSections {
  const pinAt = new Map(input.pinned.map((entry) => [entry.key, entry.at] as const));
  const pinned: SidebarProjectSnapshot[] = [];
  const rest: SidebarProjectSnapshot[] = [];
  for (const project of input.projects)
    (pinAt.has(projectPinKey(project)) ? pinned : rest).push(project);
  pinned.sort((a, b) => pinAt.get(projectPinKey(a))! - pinAt.get(projectPinKey(b))!);
  const activity = (project: SidebarProjectSnapshot) =>
    input.lastActivityByKey.get(project.projectKey) ?? 0;
  const ordered = input.sortByActivity
    ? rest.toSorted(
        (a, b) =>
          Number(isSecondaryProject(a)) - Number(isSecondaryProject(b)) ||
          activity(b) - activity(a),
      )
    : rest;
  const recent: SidebarProjectSnapshot[] = [];
  const more: SidebarProjectSnapshot[] = [];
  for (const project of ordered) {
    const last = activity(project);
    const quiet = last > 0 && input.now - last > RECENT_PROJECT_WINDOW_MS;
    (quiet ? more : recent).push(project);
  }
  return { pinned, recent, more };
}

type Listener = () => void;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((listener) => listener());
function subscribe(listener: Listener) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readItem(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Private mode or a full quota: the preference stays for this session only. */
  }
  emit();
}

export function useSidebarGrouping(): SidebarGrouping {
  return useSyncExternalStore(
    subscribe,
    () => parseSidebarGrouping(readItem(SIDEBAR_GROUPING_STORAGE_KEY)),
    () => "project",
  );
}
export function setSidebarGrouping(grouping: SidebarGrouping) {
  writeItem(SIDEBAR_GROUPING_STORAGE_KEY, grouping);
}

let pinnedRaw: string | null | undefined;
let pinnedParsed: readonly PinnedProject[] = [];
const EMPTY_PINNED: readonly PinnedProject[] = [];
function readPinned(): readonly PinnedProject[] {
  const raw = readItem(SIDEBAR_PINNED_STORAGE_KEY);
  if (raw !== pinnedRaw) {
    pinnedRaw = raw;
    pinnedParsed = parsePinnedProjects(raw);
  }
  return pinnedParsed;
}
export function usePinnedProjects(): readonly PinnedProject[] {
  return useSyncExternalStore(subscribe, readPinned, () => EMPTY_PINNED);
}
export function togglePinnedProjectKey(key: string) {
  writeItem(
    SIDEBAR_PINNED_STORAGE_KEY,
    JSON.stringify(togglePinnedProject(readPinned(), key, Date.now())),
  );
}
export const getPinnedProjects = readPinned;
