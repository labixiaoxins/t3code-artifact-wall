import { ModelSelection, type EnvironmentId, type ServerProvider } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Equal from "effect/Equal";
import { getLocalStorageItem, setLocalStorageItem } from "../../hooks/useLocalStorage";

const Name = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(80));
export const WorkPresetSchema = Schema.Struct({ name: Name, selection: ModelSelection });
export type WorkPreset = typeof WorkPresetSchema.Type;
const ChangeSchema = Schema.Struct({
  id: Schema.String,
  at: Schema.Number,
  environmentId: Schema.String,
  presetId: Schema.String,
  before: Schema.NullOr(WorkPresetSchema),
  after: Schema.NullOr(WorkPresetSchema),
  undone: Schema.Boolean,
});
export type PresetChange = typeof ChangeSchema.Type;
const ScopeSchema = Schema.Struct({
  presets: Schema.Record(Schema.String, WorkPresetSchema),
  selectedId: Schema.NullOr(Schema.String),
  initialized: Schema.Boolean,
});
export const WorkbenchSchema = Schema.Struct({
  scopes: Schema.Record(Schema.String, ScopeSchema),
  changes: Schema.Array(ChangeSchema),
});
export type WorkbenchState = typeof WorkbenchSchema.Type;
export const WORKBENCH_KEY = "t3code:workbench-presets:v1";
export const EMPTY_WORKBENCH: WorkbenchState = { scopes: {}, changes: [] };
export const EMPTY_PRESET_SCOPE: typeof ScopeSchema.Type = {
  presets: {},
  selectedId: null,
  initialized: false,
};
export const CHANGE_MAX_AGE = 30 * 24 * 60 * 60_000;
export const REVIEW_PARTICIPANTS = "GPT-6.1-Sol · Gemini 3.8 Flash · Grok 4.7";

export function pruneChanges(state: WorkbenchState, now: number): WorkbenchState {
  return {
    ...state,
    changes: state.changes
      .filter((change) => change.at > now - CHANGE_MAX_AGE && change.at <= now)
      .slice(-200),
  };
}

export function changePreset(
  state: WorkbenchState,
  environmentId: string,
  presetId: string,
  after: WorkPreset | null,
  now: number,
  id: string,
): WorkbenchState {
  const scope = state.scopes[environmentId] ?? EMPTY_PRESET_SCOPE;
  const before = scope.presets[presetId] ?? null;
  if (Equal.equals(before, after)) return pruneChanges(state, now);
  const presets = { ...scope.presets };
  if (after) presets[presetId] = after;
  else delete presets[presetId];
  return pruneChanges(
    {
      scopes: { ...state.scopes, [environmentId]: { ...scope, presets } },
      changes: [
        ...state.changes,
        { id, at: now, environmentId, presetId, before, after, undone: false },
      ],
    },
    now,
  );
}

export function undoPresetChange(state: WorkbenchState, id: string, now: number): WorkbenchState {
  const retained = pruneChanges(state, now);
  const change = retained.changes.find((change) => change.id === id);
  if (!change || change.undone) throw new Error("Change is no longer undoable");
  const scope = state.scopes[change.environmentId] ?? EMPTY_PRESET_SCOPE;
  if (!Equal.equals(scope.presets[change.presetId] ?? null, change.after))
    throw new Error("Preset changed since this record");
  const presets = { ...scope.presets };
  if (change.before) presets[change.presetId] = change.before;
  else delete presets[change.presetId];
  return {
    ...retained,
    scopes: { ...retained.scopes, [change.environmentId]: { ...scope, presets } },
    changes: retained.changes.map((entry) =>
      entry.id === id ? { ...entry, undone: true } : entry,
    ),
  };
}

export function readWorkbench(): WorkbenchState {
  return getLocalStorageItem(WORKBENCH_KEY, WorkbenchSchema) ?? EMPTY_WORKBENCH;
}

// Config and journal share one storage write. Undo always rereads the current item,
// including writes from another tab, before comparing only the owned preset.
export function writeWorkbench(update: (state: WorkbenchState) => WorkbenchState): void {
  setLocalStorageItem(
    WORKBENCH_KEY,
    pruneChanges(update(readWorkbench()), Date.now()),
    WorkbenchSchema,
  );
  window.dispatchEvent(
    new CustomEvent("t3code:local_storage_change", { detail: { key: WORKBENCH_KEY } }),
  );
}

export function nextTaskPreset(environmentId: EnvironmentId): ModelSelection | null {
  try {
    const scope = readWorkbench().scopes[environmentId];
    return scope?.selectedId ? (scope.presets[scope.selectedId]?.selection ?? null) : null;
  } catch {
    return null;
  }
}

export function starterPresets(providers: readonly ServerProvider[]): readonly WorkPreset[] {
  const provider = providers.find(
    (provider) =>
      provider.enabled &&
      provider.driver === "codex" &&
      provider.models.some((model) => model.slug === "gpt-6.1-sol"),
  );
  if (!provider) return [];
  const make = (name: string, effort: string): WorkPreset => {
    const model = provider.models.find((model) => model.slug === "gpt-6.1-sol")!;
    const descriptor = model.capabilities?.optionDescriptors?.find(
      (option) => option.id === "reasoningEffort" && option.type === "select",
    );
    const options =
      descriptor?.type === "select" && descriptor.options.some((option) => option.id === effort)
        ? [{ id: "reasoningEffort", value: effort }]
        : [];
    return { name, selection: { instanceId: provider.instanceId, model: model.slug, options } };
  };
  return [make("快速处理", "low"), make("重要实现", "high"), make("三方审查", "high")];
}
