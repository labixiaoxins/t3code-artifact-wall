import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { ProviderInstanceId, ProviderDriverKind, type ServerProvider } from "@t3tools/contracts";
import { render } from "../../../test/render";
import { ProviderModelPicker } from "./ProviderModelPicker";
import { ModelPickerContent } from "./ModelPickerContent";
import { deriveProviderInstanceEntries } from "../../providerInstances";

const preferences = vi.hoisted(() => ({
  favorites: [] as { provider: ProviderInstanceId; model: string }[],
  toggle: vi.fn(),
}));
vi.mock("~/hooks/useSettings", async (original) => ({
  ...(await original<typeof import("~/hooks/useSettings")>()),
  useEnvironmentModelPreferences: () => ({ favorites: preferences.favorites }),
  useToggleEnvironmentModelFavorite: () => preferences.toggle,
}));

function provider(id: string, name: string, driver: string, count: number): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(id),
    driver: ProviderDriverKind.make(driver),
    displayName: name,
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-10-28T00:00:00.000Z",
    slashCommands: [],
    skills: [],
    models: Array.from({ length: count }, (_, n) => ({
      slug: `${id}-model-${n}`,
      name: `中文审阅模型 ${n + 1}`,
      isCustom: true,
      capabilities: {},
    })),
  };
}
function setup(
  providers = [
    provider("codex", "OpenAI 工作账号", "codex", 2),
    provider("claude", "Claude 工作账号", "claudeAgent", 8),
  ],
) {
  preferences.favorites = [];
  preferences.toggle.mockReset();
  const entries = deriveProviderInstanceEntries(providers);
  const onSelect = vi.fn();
  return {
    entries,
    onSelect,
    element: () => (
      <ModelPickerContent
        environmentId={null}
        activeInstanceId={entries[0]!.instanceId}
        model={entries[0]!.models[0]!.slug}
        lockedProvider={null}
        instanceEntries={entries}
        modelOptionsByInstance={new Map(entries.map((e) => [e.instanceId, e.models]))}
        keybindings={[]}
        terminalOpen={false}
        onInstanceModelChange={onSelect}
      />
    ),
  };
}
const frame = () => document.querySelector<HTMLElement>("[data-model-picker-content]")!;

it("keeps provider switches in one stable frame and marks the selected model", async () => {
  const test = setup();
  await using screen = await render(test.element());
  await expect.element(screen.getByRole("option").first()).toBeVisible();
  const height = frame().getBoundingClientRect().height;
  expect(screen.getByRole("option").first().element().textContent).not.toContain("OpenAI 工作账号");
  expect(
    screen.getByRole("option").first().element().querySelector(".lucide-check.invisible"),
  ).toBeNull();
  expect(
    screen.getByRole("option").nth(1).element().querySelector(".lucide-check.invisible"),
  ).not.toBeNull();
  await screen.getByRole("button", { name: "Claude 工作账号", exact: true }).click();
  expect(Math.abs(frame().getBoundingClientRect().height - height)).toBeLessThan(1);
  await screen.getByRole("button", { name: "OpenAI 工作账号", exact: true }).click();
  expect(Math.abs(frame().getBoundingClientRect().height - height)).toBeLessThan(1);
  await screen.getByRole("option").nth(1).click();
  expect(test.onSelect).toHaveBeenCalledWith(test.entries[0]!.instanceId, "codex-model-1");
});

it("keeps the account source in mixed search results and supports keyboard selection", async () => {
  const test = setup([
    provider("codex", "OpenAI 工作账号", "codex", 1),
    provider("claude", "Claude 工作账号", "claudeAgent", 1),
  ]);
  await using screen = await render(test.element());
  const input = screen.getByRole("combobox");
  await input.fill("中文审阅");
  await expect.element(screen.getByRole("option", { name: /OpenAI 工作账号/ })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: /Claude 工作账号/ })).toBeVisible();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(test.onSelect).toHaveBeenCalledTimes(1);
});

it("labels duplicate favorite models while keeping a selected account concise", async () => {
  const test = setup([provider("a", "账户甲", "codex", 1), provider("b", "账户乙", "codex", 1)]);
  await using screen = await render(test.element());
  await expect.element(screen.getByRole("option").first()).toBeVisible();
  expect(screen.getByRole("option").first().element().textContent).not.toContain("账户甲");
  preferences.favorites = [
    { provider: test.entries[0]!.instanceId, model: "a-model-0" },
    { provider: test.entries[1]!.instanceId, model: "b-model-0" },
  ];
  await screen.rerender(test.element());
  await screen.getByRole("button", { name: /Favorites|收藏/, exact: true }).click();
  await expect.element(screen.getByRole("option", { name: /账户甲/ })).toBeVisible();
  await expect.element(screen.getByRole("option", { name: /账户乙/ })).toBeVisible();
});

it("keeps distinct favorite models on one line without repeating their provider", async () => {
  const test = setup([provider("codex", "Codex", "codex", 2)]);
  preferences.favorites = test.entries[0]!.models.map((model) => ({
    provider: test.entries[0]!.instanceId,
    model: model.slug,
  }));
  await using screen = await render(test.element());
  await screen.getByRole("button", { name: /Favorites|收藏/, exact: true }).click();
  await expect.element(screen.getByRole("option").nth(1)).toBeVisible();
  for (const option of screen.getByRole("option").elements()) {
    expect(option.textContent).not.toContain("Codex");
  }
  await screen.getByRole("option").nth(1).click();
  expect(test.onSelect).toHaveBeenCalledWith(test.entries[0]!.instanceId, "codex-model-1");
});

it("omits account labels in mixed search when the model names are distinct", async () => {
  const first = provider("codex", "OpenAI 工作账号", "codex", 1);
  const second = provider("claude", "Claude 工作账号", "claudeAgent", 1);
  const test = setup([
    first,
    { ...second, models: second.models.map((model) => ({ ...model, name: "中文独立模型" })) },
  ]);
  await using screen = await render(test.element());
  await screen.getByRole("combobox").fill("中文");
  await expect.element(screen.getByRole("option").nth(1)).toBeVisible();
  expect(screen.getByRole("option").first().element().textContent).not.toContain("OpenAI 工作账号");
  expect(screen.getByRole("option").nth(1).element().textContent).not.toContain("Claude 工作账号");
});

it("fits a narrow viewport with larger interface type and keeps Chinese labels readable", async () => {
  const width = window.innerWidth,
    height = window.innerHeight;
  const original = document.documentElement.style.fontSize;
  await page.viewport(375, 740);
  document.documentElement.style.fontSize = "18px";
  try {
    const test = setup();
    await using screen = await render(test.element());
    await expect.element(screen.getByRole("option").first()).toBeVisible();
    expect(frame().getBoundingClientRect().width).toBeLessThanOrEqual(375);
    expect(frame().getBoundingClientRect().height).toBeLessThan(440);
    expect(screen.getByRole("option").first().element().textContent).toContain("中文审阅模型");
    const heading = screen.getByRole("option").first().element().querySelector(".truncate")!;
    expect(parseFloat(getComputedStyle(heading).fontSize)).toBeGreaterThanOrEqual(14);
    await screen.getByRole("combobox").fill("不存在的模型");
    await expect.element(screen.getByText(/No models found|未找到模型/)).toBeVisible();
  } finally {
    document.documentElement.style.fontSize = original;
    await page.viewport(width, height);
  }
});

it("keeps favorite actions separate from selection and respects disabled models", async () => {
  const test = setup();
  await using screen = await render(test.element());
  await screen
    .getByRole("button", { name: /Add to favorites|添加到收藏/ })
    .first()
    .click();
  expect(preferences.toggle).toHaveBeenCalledWith(test.entries[0]!.instanceId, "codex-model-0");
  expect(test.onSelect).not.toHaveBeenCalled();
  await screen.rerender(
    <ModelPickerContent
      environmentId={null}
      activeInstanceId={test.entries[0]!.instanceId}
      model="codex-model-0"
      lockedProvider={null}
      instanceEntries={test.entries}
      modelOptionsByInstance={new Map(test.entries.map((e) => [e.instanceId, e.models]))}
      keybindings={[]}
      terminalOpen={false}
      onInstanceModelChange={test.onSelect}
      getModelDisabledReason={() => "当前任务不可选择该模型"}
    />,
  );
  await expect.element(screen.getByRole("option").first()).toBeDisabled();
  await screen.getByRole("combobox").click();
  await userEvent.keyboard("{ArrowDown}{Enter}");
  expect(test.onSelect).not.toHaveBeenCalled();
});

it("keeps the anchored popup stable with its footer and closes after a real model choice", async () => {
  const test = setup();
  await using screen = await render(
    <div style={{ paddingTop: 450 }}>
      <ProviderModelPicker
        environmentId={null}
        activeInstanceId={test.entries[0]!.instanceId}
        model="codex-model-0"
        lockedProvider={null}
        instanceEntries={test.entries}
        modelOptionsByInstance={new Map(test.entries.map((e) => [e.instanceId, e.models]))}
        keybindings={[]}
        onInstanceModelChange={test.onSelect}
        triggerAriaLabel="模型切换测试"
        footer={<div>新任务默认模型</div>}
      />
    </div>,
  );
  await screen.getByRole("button", { name: "模型切换测试" }).click();
  await expect.element(page.getByRole("combobox")).toHaveFocus();
  const popup = document.querySelector<HTMLElement>('[data-slot="popover-popup"]')!;
  await expect.poll(() => popup.hasAttribute("data-starting-style")).toBe(false);
  await Promise.all(popup.getAnimations().map((animation) => animation.finished));
  const before = popup.getBoundingClientRect();
  await page.getByRole("button", { name: "Claude 工作账号", exact: true }).click();
  expect(Math.abs(popup.getBoundingClientRect().height - before.height)).toBeLessThan(1);
  expect(Math.abs(popup.getBoundingClientRect().y - before.y)).toBeLessThan(1);
  await page.getByRole("option").first().click();
  expect(test.onSelect).toHaveBeenCalledWith(test.entries[1]!.instanceId, "claude-model-0");
  await expect.element(page.getByRole("combobox")).not.toBeInTheDocument();
});
