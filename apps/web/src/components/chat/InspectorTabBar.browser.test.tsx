import { describe, expect, it } from "vite-plus/test";
import { render } from "../../../test/render";
import {
  INSPECTOR_TAB_STORAGE_KEY,
  resolveInspectorTab,
  useInspectorTab,
} from "../../inspectorTabs";
import { InspectorTabBar } from "./InspectorTabBar";

const LABELS = { artifacts: "产物 3", history: "续聊", run: "运行", project: "项目" } as const;

function Harness({ available }: { available: Parameters<typeof resolveInspectorTab>[1] }) {
  const [stored, setStored] = useInspectorTab();
  const tab = resolveInspectorTab(stored, available);
  return (
    <>
      <InspectorTabBar tabs={available} labels={LABELS} value={tab} onChange={setStored} />
      <p data-testid="body">{tab}</p>
    </>
  );
}

const pressed = (container: Element) =>
  [...container.querySelectorAll<HTMLButtonElement>("[aria-label=检查器] button")]
    .filter((button) => button.getAttribute("aria-pressed") === "true")
    .map((button) => button.textContent);

describe("inspector tabs", () => {
  it("switches tabs and remembers the last one for the next mount", async () => {
    localStorage.removeItem(INSPECTOR_TAB_STORAGE_KEY);
    {
      await using screen = await render(
        <Harness available={["artifacts", "history", "run", "project"]} />,
        {
          // Pure component test: nothing here navigates.
          router: false,
        },
      );
      expect(pressed(screen.container)).toEqual(["产物 3"]);
      [...screen.container.querySelectorAll<HTMLButtonElement>("[aria-label=检查器] button")]
        .find((button) => button.textContent === "续聊")!
        .click();
      await expect.poll(() => pressed(screen.container)).toEqual(["续聊"]);
      expect(screen.container.querySelector("[data-testid=body]")!.textContent).toBe("history");
    }
    expect(localStorage.getItem(INSPECTOR_TAB_STORAGE_KEY)).toBe("history");
    await using again = await render(
      <Harness available={["artifacts", "history", "run", "project"]} />,
      {
        router: false,
      },
    );
    expect(pressed(again.container)).toEqual(["续聊"]);
  });

  it("falls back to an available tab when the remembered one does not exist (drafts)", async () => {
    localStorage.setItem(INSPECTOR_TAB_STORAGE_KEY, "history");
    await using screen = await render(<Harness available={["project"]} />, { router: false });
    expect(screen.container.querySelector("[data-testid=body]")!.textContent).toBe("project");
    localStorage.removeItem(INSPECTOR_TAB_STORAGE_KEY);
  });
});

it("opens the run tab without removing existing inspector entries", async () => {
  localStorage.removeItem(INSPECTOR_TAB_STORAGE_KEY);
  await using screen = await render(
    <Harness available={["artifacts", "history", "run", "project"]} />,
  );
  const run = [
    ...screen.container.querySelectorAll<HTMLButtonElement>("[aria-label=检查器] button"),
  ].find((button) => button.textContent === "运行")!;
  run.dispatchEvent(new KeyboardEvent("keydown", { key: "r", altKey: true, bubbles: true }));
  await expect.poll(() => pressed(screen.container)).toEqual(["运行"]);
  expect(screen.container.querySelector("[data-testid=body]")!.textContent).toBe("run");
  expect(screen.container.querySelectorAll("[aria-label=检查器] button")).toHaveLength(4);
  localStorage.removeItem(INSPECTOR_TAB_STORAGE_KEY);
});
