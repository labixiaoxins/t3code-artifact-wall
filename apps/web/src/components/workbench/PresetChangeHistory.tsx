import { useState } from "react";
import { uiText } from "~/i18n";
import { Button } from "../ui/button";
import { useWorkPresets } from "./useWorkPresets";
import { undoPresetChange, writeWorkbench, type WorkPreset } from "./workPresets";

function describePreset(preset: WorkPreset | null) {
  return preset
    ? `${preset.name} · ${preset.selection.instanceId} · ${preset.selection.model}${preset.selection.options?.length ? ` · ${preset.selection.options.map((option) => `${option.id}=${option.value}`).join(", ")}` : ""}`
    : uiText("Absent");
}

export function PresetChangeHistory() {
  const state = useWorkPresets();
  const [error, setError] = useState(false);
  const changes = [...state.changes].reverse();
  return (
    <div className="space-y-3 text-sm">
      <p className="text-muted-foreground">
        {uiText(
          "Only preset changes written by this workbench on this browser are recorded. Kept for 30 days, up to 200 records.",
        )}
      </p>
      {error ? (
        <p role="alert">
          {uiText(
            "Undo refused: the current preset has changed, the record expired, or local storage is unavailable.",
          )}
        </p>
      ) : null}
      {changes.length === 0 ? (
        <p>{uiText("No configuration changes")}</p>
      ) : (
        <ol className="space-y-3">
          {changes.map((change) => (
            <li key={change.id} className="space-y-1 rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <time dateTime={new Date(change.at).toISOString()}>
                  {new Date(change.at).toLocaleString()}
                </time>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={change.undone}
                  onClick={() => {
                    try {
                      writeWorkbench((current) => undoPresetChange(current, change.id, Date.now()));
                      setError(false);
                    } catch {
                      setError(true);
                    }
                  }}
                >
                  {change.undone ? uiText("Undone") : uiText("Undo")}
                </Button>
              </div>
              <p>
                {!change.before
                  ? uiText("Created preset")
                  : !change.after
                    ? uiText("Deleted preset")
                    : uiText("Updated preset")}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {describePreset(change.before)} → {describePreset(change.after)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
