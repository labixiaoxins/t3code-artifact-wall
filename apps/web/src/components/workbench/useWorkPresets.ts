import { useEffect } from "react";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import {
  EMPTY_WORKBENCH,
  WORKBENCH_KEY,
  WorkbenchSchema,
  pruneChanges,
  writeWorkbench,
} from "./workPresets";
import * as Equal from "effect/Equal";

export function useWorkPresets() {
  const [state] = useLocalStorage(WORKBENCH_KEY, EMPTY_WORKBENCH, WorkbenchSchema);
  useEffect(() => {
    const prune = () => {
      try {
        writeWorkbench((current) => pruneChanges(current, Date.now()));
      } catch {
        /* A read-only client can still inspect its preferences. */
      }
    };
    if (!Equal.equals(state.changes, pruneChanges(state, Date.now()).changes)) prune();
    const timer = window.setInterval(prune, 60 * 60_000);
    return () => window.clearInterval(timer);
  }, [state.changes]);
  return state;
}
