import { useEffect, useState } from "react";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  EMPTY_WORKBENCH,
  WORKBENCH_KEY,
  WorkbenchSchema,
  pruneChanges,
  readWorkbench,
  writeWorkbench,
} from "./workPresets";
import * as Equal from "effect/Equal";

export function useWorkPresets() {
  const [state] = useLocalStorage(WORKBENCH_KEY, EMPTY_WORKBENCH, WorkbenchSchema);
  const [now, setNow] = useState(() => Date.now());
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep the retention clock in step with storage changes and its hourly expiry timer, even when storage is read-only.
  useEffect(() => {
    const prune = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      try {
        const current = readWorkbench();
        if (!Equal.equals(current.changes, pruneChanges(current, currentTime).changes)) {
          writeWorkbench((latest) => pruneChanges(latest, currentTime));
        }
      } catch {
        /* A read-only client can still inspect its preferences. */
      }
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key === WORKBENCH_KEY) prune();
    };
    const localChanged = (event: Event) => {
      if ((event as CustomEvent<{ key: string }>).detail.key === WORKBENCH_KEY) prune();
    };
    prune();
    const timer = window.setInterval(prune, 60 * 60_000);
    window.addEventListener("storage", storageChanged);
    window.addEventListener("t3code:local_storage_change", localChanged);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", storageChanged);
      window.removeEventListener("t3code:local_storage_change", localChanged);
    };
  }, []);
  return pruneChanges(state, now);
}
