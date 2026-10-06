import { create } from "zustand";

export const THREAD_PLACEMENT_STORAGE_KEY = "t3code:sidebar-thread-placement:v1";
export const THREAD_PLACEMENT_DRAG_TYPE = "application/x-t3-sidebar-thread";
export type ThreadPlacements = Readonly<Record<string, string>>;

export function parseThreadPlacements(value: unknown): Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, target]) => key.length > 0 && typeof target === "string" && target.length > 0,
    ),
  );
}

function readPlacements() {
  try {
    return parseThreadPlacements(
      JSON.parse(localStorage.getItem(THREAD_PLACEMENT_STORAGE_KEY) ?? "{}"),
    );
  } catch {
    return {};
  }
}

let revision = 0;

// Sidebar organization only. Never changes projectId, workspaceRoot or provider resume state.
export const useThreadPlacementStore = create<{
  placements: ThreadPlacements;
  revisions: Readonly<Record<string, number>>;
  undo: (threadKey: string, revision: number, previous: string | null) => "ok" | "stale" | "failed";
  move: (threadKey: string, target: string | null) => boolean;
}>((set, get) => ({
  placements: readPlacements(),
  revisions: {},
  undo: (threadKey, expectedRevision, previous) => {
    if (get().revisions[threadKey] !== expectedRevision) return "stale";
    return get().move(threadKey, previous) ? "ok" : "failed";
  },
  move: (threadKey, target) => {
    const next = { ...get().placements };
    if (target === null) delete next[threadKey];
    else next[threadKey] = target;
    try {
      localStorage.setItem(THREAD_PLACEMENT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      return false;
    }
    set({ placements: next, revisions: { ...get().revisions, [threadKey]: ++revision } });
    return true;
  },
}));

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === THREAD_PLACEMENT_STORAGE_KEY || event.key === null) {
      useThreadPlacementStore.setState({ placements: readPlacements(), revisions: {} });
    }
  });
}
