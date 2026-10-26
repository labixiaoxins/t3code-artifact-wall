import { expect, it, onTestFinished } from "vite-plus/test";
import { render } from "../../../test/render";
import { EnvironmentId, ProjectId, ProviderInstanceId } from "@t3tools/contracts";
import { WorkPresetPicker } from "./WorkPresetPicker";
import { PresetChangeHistory } from "./PresetChangeHistory";
import {
  changePreset,
  EMPTY_WORKBENCH,
  readWorkbench,
  WORKBENCH_KEY,
  writeWorkbench,
} from "./workPresets";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";

const environmentId = EnvironmentId.make("env-browser");
const selection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-6.1-sol",
  options: [{ id: "reasoningEffort", value: "high" }],
};

it("selecting a preset only initializes the next new task", async () => {
  localStorage.removeItem(WORKBENCH_KEY);
  const original = useComposerDraftStore.getState();
  onTestFinished(() => {
    localStorage.removeItem(WORKBENCH_KEY);
    useComposerDraftStore.setState(original);
  });
  useComposerDraftStore.setState({
    draftsByThreadKey: {},
    draftThreadsByThreadKey: {},
    logicalProjectDraftThreadKeyByLogicalProjectKey: {},
  });
  const store = useComposerDraftStore.getState();
  const project = { environmentId, projectId: ProjectId.make("project") };
  const oldDraft = DraftId.make("old");
  store.setProjectDraftThreadId(project, oldDraft);
  store.setPrompt(oldDraft, "existing work");
  writeWorkbench(() =>
    changePreset(
      EMPTY_WORKBENCH,
      environmentId,
      "review",
      { name: "三方审查", selection },
      Date.now(),
      "create",
    ),
  );
  await using screen = await render(
    <WorkPresetPicker environmentId={environmentId} currentSelection={selection} providers={[]} />,
  );
  await screen.getByRole("combobox", { name: "Work style" }).selectOptions("review");
  expect(readWorkbench().scopes[environmentId]?.selectedId).toBe("review");
  expect(store.getComposerDraft(oldDraft)?.activeProvider).toBeNull();
  const next = DraftId.make("next");
  store.setProjectDraftThreadId(project, next);
  expect(store.getComposerDraft(next)?.modelSelectionByProvider[selection.instanceId]).toEqual(
    selection,
  );
  expect(screen.container.textContent).toContain("GPT-6.1-Sol · Gemini 3.8 Flash · Grok 4.7");
  expect(store.getComposerDraft(oldDraft)?.prompt).toBe("existing work");
});

it("creates, renames, updates, deletes and restores only a preset through the UI", async () => {
  localStorage.removeItem(WORKBENCH_KEY);
  onTestFinished(() => localStorage.removeItem(WORKBENCH_KEY));
  await using screen = await render(
    <>
      <WorkPresetPicker environmentId={environmentId} currentSelection={selection} providers={[]} />
      <PresetChangeHistory />
    </>,
  );
  await screen.getByRole("button", { name: "Manage presets" }).click();
  await screen.getByRole("textbox", { name: "Preset name" }).fill("Fast");
  await screen.getByRole("button", { name: "Create preset", exact: true }).click();
  const id = Object.keys(readWorkbench().scopes[environmentId]!.presets)[0]!;
  await screen.getByRole("combobox", { name: "Work style" }).selectOptions(id);
  await screen.getByRole("textbox", { name: "Preset name" }).fill("Important");
  await screen.getByRole("button", { name: "Rename", exact: true }).click();
  expect(readWorkbench().scopes[environmentId]!.presets[id]!.name).toBe("Important");
  const updatedSelection = { ...selection, model: "gpt-updated" };
  await screen.rerender(
    <>
      <WorkPresetPicker
        environmentId={environmentId}
        currentSelection={updatedSelection}
        providers={[]}
      />
      <PresetChangeHistory />
    </>,
  );
  await screen.getByRole("button", { name: "Update from model picker", exact: true }).click();
  expect(readWorkbench().scopes[environmentId]!.presets[id]!.selection.model).toBe("gpt-updated");
  await screen.getByRole("button", { name: "Delete preset", exact: true }).click();
  expect(readWorkbench().scopes[environmentId]!.presets[id]).toBeUndefined();
  await screen.getByRole("button", { name: "Undo", exact: true }).first().click();
  expect(readWorkbench().scopes[environmentId]!.presets[id]!.name).toBe("Important");
  await screen.getByRole("button", { name: "Undo", exact: true }).last().click();
  await expect.element(screen.getByRole("alert")).toBeVisible();
  expect(readWorkbench().scopes[environmentId]!.presets[id]!.name).toBe("Important");
});

it("refuses an undo after another browser tab changes that same preset", async () => {
  localStorage.removeItem(WORKBENCH_KEY);
  onTestFinished(() => localStorage.removeItem(WORKBENCH_KEY));
  writeWorkbench(() =>
    changePreset(
      EMPTY_WORKBENCH,
      environmentId,
      "owned",
      { name: "Original", selection },
      Date.now(),
      "create",
    ),
  );
  await using screen = await render(<PresetChangeHistory />);
  const current = readWorkbench();
  localStorage.setItem(
    WORKBENCH_KEY,
    JSON.stringify({
      ...current,
      scopes: {
        ...current.scopes,
        [environmentId]: {
          ...current.scopes[environmentId],
          presets: { owned: { name: "Changed elsewhere", selection } },
        },
      },
    }),
  );
  await screen.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.element(screen.getByRole("alert")).toBeVisible();
  expect(readWorkbench().scopes[environmentId]!.presets.owned!.name).toBe("Changed elsewhere");
});
