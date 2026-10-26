import { randomUUID } from "../../lib/utils";
import { accountAlias } from "../chat/runInspectorModel";
import { useEffect, useState } from "react";
import type { EnvironmentId, ModelSelection, ServerProvider } from "@t3tools/contracts";
import { uiText } from "~/i18n";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { useWorkPresets } from "./useWorkPresets";
import {
  changePreset,
  EMPTY_PRESET_SCOPE,
  REVIEW_PARTICIPANTS,
  starterPresets,
  writeWorkbench,
} from "./workPresets";

export function WorkPresetPicker({
  environmentId,
  currentSelection,
  providers,
}: {
  environmentId: EnvironmentId;
  currentSelection: ModelSelection;
  providers: readonly ServerProvider[];
}) {
  const state = useWorkPresets();
  const scope = state.scopes[environmentId] ?? EMPTY_PRESET_SCOPE;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState(false);
  const selected = scope.selectedId ? scope.presets[scope.selectedId] : null;
  const starters = starterPresets(providers);
  useEffect(() => {
    if (scope.initialized || starters.length === 0) return;
    try {
      writeWorkbench((current) => {
        if (current.scopes[environmentId]?.initialized) return current;
        let next = current;
        for (const preset of starters)
          next = changePreset(next, environmentId, randomUUID(), preset, Date.now(), randomUUID());
        return {
          ...next,
          scopes: {
            ...next.scopes,
            [environmentId]: {
              ...(next.scopes[environmentId] ?? EMPTY_PRESET_SCOPE),
              initialized: true,
            },
          },
        };
      });
    } catch {
      /* Explicit writes below report storage failures. */
    }
  }, [environmentId, scope.initialized, starters]);
  const mutate = (update: Parameters<typeof writeWorkbench>[0]) => {
    try {
      writeWorkbench(update);
      setError(false);
    } catch {
      setError(true);
    }
  };
  const save = (replace: boolean) => {
    if (!name.trim() || (replace && !scope.selectedId)) return;
    const id = replace ? scope.selectedId! : randomUUID();
    mutate((state) =>
      changePreset(
        state,
        environmentId,
        id,
        { name: name.trim(), selection: currentSelection },
        Date.now(),
        randomUUID(),
      ),
    );
  };
  return (
    <div className="mb-2 space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <label>
          {uiText("Work style")}{" "}
          <select
            aria-label={uiText("Work style")}
            value={selected ? (scope.selectedId ?? "") : ""}
            onChange={(event) => {
              const id = event.target.value || null;
              mutate((current) => ({
                ...current,
                scopes: {
                  ...current.scopes,
                  [environmentId]: {
                    ...(current.scopes[environmentId] ?? EMPTY_PRESET_SCOPE),
                    selectedId: id,
                  },
                },
              }));
            }}
            className="max-w-48 rounded-md border bg-background px-2 py-1 text-foreground"
          >
            <option value="">{uiText("Use existing defaults")}</option>
            {Object.entries(scope.presets).map(([id, preset]) => (
              <option key={id} value={id}>
                {preset.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="xs"
          variant="ghost"
          onClick={() => {
            setOpen(!open);
            setName(selected?.name ?? "");
          }}
        >
          {uiText("Manage presets")}
        </Button>
      </div>
      {open || selected ? (
        <p className="text-muted-foreground">
          {uiText("Applies only when creating the next task. Current tasks stay unchanged.")}
        </p>
      ) : null}
      {selected ? (
        <p className="break-all text-muted-foreground">
          {accountAlias(
            providers.find((provider) => provider.instanceId === selected.selection.instanceId)
              ?.displayName,
          ) ?? uiText("Not reported")}{" "}
          · {selected.selection.model} ·{" "}
          {(selected.selection.options ?? [])
            .map((option) => `${option.id}: ${option.value}`)
            .join(" · ")}
        </p>
      ) : null}
      {open || selected ? (
        <p className="text-muted-foreground">
          {uiText("Review participants (manual)")}: {REVIEW_PARTICIPANTS}
        </p>
      ) : null}
      {open ? (
        <div className="space-y-2 rounded-md border p-2">
          <Input
            aria-label={uiText("Preset name")}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
          <p className="text-muted-foreground">
            {uiText("Save the current model picker selection, including its options.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="xs" variant="outline" disabled={!name.trim()} onClick={() => save(false)}>
              {uiText("Create preset")}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!selected || !name.trim()}
              onClick={() =>
                mutate((current) => {
                  const preset = scope.selectedId
                    ? current.scopes[environmentId]?.presets[scope.selectedId]
                    : null;
                  return preset && scope.selectedId
                    ? changePreset(
                        current,
                        environmentId,
                        scope.selectedId,
                        { ...preset, name: name.trim() },
                        Date.now(),
                        randomUUID(),
                      )
                    : current;
                })
              }
            >
              {uiText("Rename")}
            </Button>
            <Button
              size="xs"
              variant="outline"
              disabled={!selected || !name.trim()}
              onClick={() => save(true)}
            >
              {uiText("Update from model picker")}
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={!scope.selectedId || !selected}
              onClick={() =>
                mutate((current) =>
                  changePreset(
                    current,
                    environmentId,
                    scope.selectedId!,
                    null,
                    Date.now(),
                    randomUUID(),
                  ),
                )
              }
            >
              {uiText("Delete preset")}
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <p role="alert">{uiText("Could not save local preferences")}</p> : null}
    </div>
  );
}
