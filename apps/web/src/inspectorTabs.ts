import { useSyncExternalStore } from "react";

export type InspectorTab = "artifacts" | "history" | "run" | "project";
export const INSPECTOR_TABS: readonly InspectorTab[] = ["artifacts", "history", "run", "project"];
export const INSPECTOR_TAB_STORAGE_KEY = "t3code:inspector-tab:v1";

export function parseInspectorTab(raw: string | null): InspectorTab | null {
  return INSPECTOR_TABS.find((tab) => tab === raw) ?? null;
}

/** The remembered tab, or the first one this thread actually has (drafts have no history or artifacts). */
export function resolveInspectorTab(
  stored: InspectorTab | null,
  available: readonly InspectorTab[],
): InspectorTab {
  return stored && available.includes(stored) ? stored : (available[0] ?? "project");
}

const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}
function readStored(): string | null {
  try {
    return localStorage.getItem(INSPECTOR_TAB_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function useInspectorTab(): readonly [InspectorTab | null, (tab: InspectorTab) => void] {
  const raw = useSyncExternalStore(subscribe, readStored, () => null);
  return [
    parseInspectorTab(raw),
    (tab) => {
      try {
        localStorage.setItem(INSPECTOR_TAB_STORAGE_KEY, tab);
      } catch {
        /* Storage unavailable: the tab still switches for this session through the listeners. */
      }
      listeners.forEach((listener) => listener());
    },
  ];
}
