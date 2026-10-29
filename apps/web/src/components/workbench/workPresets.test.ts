import { describe, expect, it, onTestFinished } from "vite-plus/test";
import * as Schema from "effect/Schema";
import { EnvironmentId, ProjectId, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import { setLocalStorageItem, removeLocalStorageItem } from "../../hooks/useLocalStorage";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import {
  CHANGE_MAX_AGE,
  EMPTY_WORKBENCH,
  WORKBENCH_KEY,
  WorkbenchSchema,
  changePreset,
  undoPresetChange,
  pruneChanges,
  starterPresets,
  type WorkPreset,
} from "./workPresets";

const preset = (name = "Fast"): WorkPreset => ({
  name,
  selection: {
    instanceId: ProviderInstanceId.make("codex-alias"),
    model: "gpt-6.1-sol",
    options: [{ id: "reasoningEffort", value: "high" }],
  },
});
const create = () => changePreset(EMPTY_WORKBENCH, "env", "one", preset(), 100, "c1");

describe("workbench-owned preset journal", () => {
  it("validates stored selections and rejects malformed schemas", () => {
    const decode = Schema.decodeSync(WorkbenchSchema);
    expect(() =>
      decode({
        scopes: {
          env: {
            presets: { one: { name: "broken", selection: { model: 42 } } },
            selectedId: null,
            initialized: false,
          },
        },
        changes: [],
      }),
    ).toThrow();
    expect(decode(create())).toEqual(create());
  });
  it("undoes creation, modification and deletion", () => {
    expect(undoPresetChange(create(), "c1", 200).scopes.env!.presets.one).toBeUndefined();
    const edited = changePreset(create(), "env", "one", preset("Important"), 200, "c2");
    expect(undoPresetChange(edited, "c2", 300).scopes.env!.presets.one).toEqual(preset());
    const deleted = changePreset(edited, "env", "one", null, 300, "c3");
    expect(undoPresetChange(deleted, "c3", 400).scopes.env!.presets.one).toEqual(
      preset("Important"),
    );
  });
  it("refuses undo when the current value drifted", () => {
    const edited = changePreset(create(), "env", "one", preset("Later"), 200, "c2");
    expect(() => undoPresetChange(edited, "c1", 300)).toThrow("Preset changed");
    expect(edited.scopes.env!.presets.one?.name).toBe("Later");
  });
  it("does not overwrite unrelated presets or environments", () => {
    const another = changePreset(
      changePreset(create(), "env", "two", preset("Other"), 200, "c2"),
      "elsewhere",
      "one",
      preset("Remote"),
      300,
      "c3",
    );
    const undone = undoPresetChange(another, "c1", 400);
    expect(undone.scopes.env!.presets.two?.name).toBe("Other");
    expect(undone.scopes.elsewhere!.presets.one?.name).toBe("Remote");
  });
  it("rejects repeated undo and expired records", () => {
    expect(() => undoPresetChange(undoPresetChange(create(), "c1", 200), "c1", 300)).toThrow();
    expect(() => undoPresetChange(create(), "c1", CHANGE_MAX_AGE + 100)).toThrow();
  });
  it("keeps at most 200 records and removes records at 30 days", () => {
    let state = EMPTY_WORKBENCH;
    for (let i = 0; i < 210; i++)
      state = changePreset(state, "env", "one", preset(String(i)), i, String(i));
    expect(state.changes).toHaveLength(200);
    expect(
      pruneChanges(state, CHANGE_MAX_AGE + 150).changes.every((change) => change.at > 150),
    ).toBe(true);
    expect(pruneChanges(state, CHANGE_MAX_AGE + 210).changes).toEqual([]);
  });
  it("records only schema-owned preset fields", () => {
    const decode = Schema.decodeSync(WorkbenchSchema);
    const serialized = JSON.stringify(
      decode(Object.assign(create(), { chat: "private body", credential: "private secret" })),
    );
    expect(serialized).not.toContain("private");
  });
});

it("ignores retired task defaults without changing existing drafts or saved presets", () => {
  const original = useComposerDraftStore.getState();
  onTestFinished(() => {
    useComposerDraftStore.setState(original);
    removeLocalStorageItem(WORKBENCH_KEY);
  });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  const environmentId = EnvironmentId.make("env");
  const project = { environmentId, projectId: ProjectId.make("project") };
  const before = DraftId.make("before");
  const after = DraftId.make("after");
  const store = useComposerDraftStore.getState();
  store.setProjectDraftThreadId(project, before);
  store.setPrompt(before, "keep this task");
  const created = create();
  const state = {
    ...created,
    scopes: { ...created.scopes, env: { ...created.scopes.env!, selectedId: "one" } },
  };
  setLocalStorageItem(WORKBENCH_KEY, state, WorkbenchSchema);
  expect(useComposerDraftStore.getState().getComposerDraft(before)?.activeProvider).toBeNull();
  store.setProjectDraftThreadId(project, before);
  expect(useComposerDraftStore.getState().getComposerDraft(before)?.activeProvider).toBeNull();
  store.setProjectDraftThreadId(project, after);
  expect(
    useComposerDraftStore.getState().getComposerDraft(after)?.modelSelectionByProvider[
      ProviderInstanceId.make("codex-alias")
    ],
  ).toBeUndefined();
  setLocalStorageItem(
    WORKBENCH_KEY,
    changePreset(
      state,
      "env",
      "one",
      { ...preset("Later"), selection: { ...preset().selection, model: "changed-model" } },
      300,
      "c2",
    ),
    WorkbenchSchema,
  );
  expect(
    useComposerDraftStore.getState().getComposerDraft(after)?.modelSelectionByProvider[
      ProviderInstanceId.make("codex-alias")
    ],
  ).toBeUndefined();
  expect(useComposerDraftStore.getState().getComposerDraft(before)?.prompt).toBe("keep this task");
});

const decodeProvider = Schema.decodeSync(ServerProvider);
it("only creates starter presets from the live Codex model and supported reasoning choices", () => {
  const provider = decodeProvider({
    instanceId: "codex_work",
    driver: "codex",
    displayName: "Work",
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "unknown" },
    checkedAt: "2026-10-26T00:00:00Z",
    models: [
      {
        slug: "gpt-6.1-sol",
        name: "GPT-6.1-Sol",
        isCustom: false,
        capabilities: {
          optionDescriptors: [
            {
              id: "reasoningEffort",
              type: "select",
              label: "Reasoning",
              options: [{ id: "high", label: "High" }],
            },
          ],
        },
      },
    ],
  });
  const starters = starterPresets([provider]);
  expect(starters.map((preset) => preset.name)).toEqual([
    "Quick handling",
    "Important implementation",
  ]);
  expect(starters[0]?.selection.options).toEqual([]);
  expect(starters[1]?.selection).toEqual({
    instanceId: "codex_work",
    model: "gpt-6.1-sol",
    options: [{ id: "reasoningEffort", value: "high" }],
  });
  expect(starterPresets([{ ...provider, models: [] }])).toEqual([]);
  expect(starterPresets([{ ...provider, enabled: false }])).toEqual([]);
});
