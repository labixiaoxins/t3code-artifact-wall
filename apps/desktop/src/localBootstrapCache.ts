import type { DesktopEnvironmentBootstrap } from "@t3tools/contracts";

export function createLocalBootstrapCache(
  readInitial: () => readonly DesktopEnvironmentBootstrap[],
) {
  let snapshot: readonly DesktopEnvironmentBootstrap[] | undefined;
  const listeners = new Set<() => void>();
  return {
    read: () => (snapshot ??= readInitial()),
    update: (entries: readonly DesktopEnvironmentBootstrap[]) => {
      snapshot = entries;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
