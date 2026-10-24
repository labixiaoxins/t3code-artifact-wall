import { uiText } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useRef } from "react";

import { primaryServerLegacyThreadMigrationAtom } from "../state/server";
import { toastManager } from "./ui/toast";

type MigrationToastId = ReturnType<typeof toastManager.add>;

export function LegacyThreadMigrationToast() {
  const migration = useAtomValue(primaryServerLegacyThreadMigrationAtom);
  const toastIdRef = useRef<MigrationToastId | null>(null);

  useEffect(() => {
    if (migration?.status === "running") {
      if (toastIdRef.current !== null) {
        return;
      }
      toastIdRef.current = toastManager.add({
        type: "loading",
        title: uiText("Restoring your threads…"),
        description: uiText("Migrating {0} {1} from the previous version. You can keep working while this finishes.", {"0": migration.totalThreadCount.toLocaleString(), "1": migration.totalThreadCount === 1 ? "thread" : "threads"}),
        timeout: 0,
      });
      return;
    }

    if (toastIdRef.current !== null) {
      toastManager.close(toastIdRef.current);
      toastIdRef.current = null;
    }
  }, [migration]);

  useEffect(
    () => () => {
      if (toastIdRef.current !== null) {
        toastManager.close(toastIdRef.current);
      }
    },
    [],
  );

  return null;
}
