import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { render } from "../../../test/render";
import { makeThreadFixture } from "../../test-fixtures";
import { subtaskThreadKey } from "../../sidebarSubtasks";
import { ActiveWorkOverview } from "./ActiveWorkOverview";

const parent = makeThreadFixture({ id: ThreadId.make("parent"), title: "Parent video" });
const children = Array.from({ length: 7 }, (_, index) =>
  makeThreadFixture({
    id: ThreadId.make(`child-${index}`),
    title: `Review ${index}`,
    environmentId: parent.environmentId,
    modelSelection: {
      instanceId: ProviderInstanceId.make(index % 2 ? "grok" : "claudeAgent"),
      model: "test",
    },
    lineage: {
      rootThreadId: parent.id,
      parentThreadId: parent.id,
      relationshipToParent: "subagent",
    },
    runtime: {
      status: "running",
      activeRunId: null,
      providerInstanceId: ProviderInstanceId.make(index % 2 ? "grok" : "claudeAgent"),
      providerName: index % 2 ? "Grok" : "Claude",
      lastError: null,
      updatedAt: "2026-10-23",
    },
  }),
);

describe("active work navigation", () => {
  it("opens a child directly, collapses active children, and exposes overflow without growing the fixed header", async () => {
    const navigate = vi.fn();
    await using screen = await render(
      <ActiveWorkOverview
        threads={[parent, ...children]}
        projects={[]}
        activeKey={null}
        navigate={navigate}
      />,
    );
    await screen.getByRole("button", { name: /Review 0/ }).click();
    expect(navigate).toHaveBeenCalledWith(expect.objectContaining({ threadId: children[0]!.id }));
    await screen.getByRole("button", { name: "收起Parent video的子任务" }).click();
    await expect.element(screen.getByRole("button", { name: /Review 0/ })).not.toBeInTheDocument();
    await screen.getByRole("button", { name: /查看全部/ }).click();
    await page.getByRole("button", { name: /Review 6/ }).click();
    expect(navigate).toHaveBeenLastCalledWith(
      expect.objectContaining({ threadId: children[6]!.id }),
    );
    await expect
      .element(page.getByText("正在进行 · 1 个主任务，7 个子任务"))
      .not.toBeInTheDocument();
  });
  it("labels the running provider even if the next composer selection has changed", async () => {
    const thread = { ...children[0]!, runtime: { ...children[0]!.runtime!, providerInstanceId: ProviderInstanceId.make("codex"), providerName: "Codex" } };
    await using screen = await render(<ActiveWorkOverview threads={[parent, thread]} projects={[]} activeKey={null} navigate={vi.fn()} />);
    const label = [...screen.container.querySelectorAll("button")].find((button) => button.textContent?.includes("Review 0"))?.textContent;
    expect(label).toContain("Codex");
    expect(label).not.toContain("Claude");
  });
  it("survives fresh summary objects and repeated navigation, then removes completed children", async () => {
    const navigate = vi.fn();
    await using screen = await render(
      <ActiveWorkOverview
        threads={[parent, ...children]}
        projects={[]}
        activeKey={null}
        navigate={navigate}
      />,
    );
    for (let i = 0; i < 12; i++) {
      await screen.rerender(
        <ActiveWorkOverview
          threads={[{ ...parent }, ...children.map((t) => ({ ...t }))]}
          projects={[]}
          activeKey={subtaskThreadKey(children[i % 2]!)}
          navigate={navigate}
        />,
      );
      await screen.getByRole("button", { name: new RegExp(`Review ${i % 2}`) }).click();
    }
    expect(navigate).toHaveBeenCalledTimes(12);
    await screen.rerender(
      <ActiveWorkOverview
        threads={[parent, ...children.map((t) => ({ ...t, runtime: null }))]}
        projects={[]}
        activeKey={null}
        navigate={navigate}
      />,
    );
    await expect.element(screen.getByText("暂无运行任务")).toBeVisible();
  });
  it.each([390, 1440])(
    "fits a 280px sidebar at viewport %i and exposes disconnected state",
    async (width) => {
      await page.viewport(width, 900);
      const container = document.createElement("div");
      container.style.width = "280px";
      await using screen = await render(
        <ActiveWorkOverview
          threads={[parent, ...children]}
          projects={[]}
          activeKey={null}
          navigate={vi.fn()}
          incomplete
        />,
        { container },
      );
      await expect.element(screen.getByText("连接未就绪，状态可能尚未更新。")).toBeVisible();
      expect(container.scrollWidth).toBeLessThanOrEqual(container.clientWidth);
      expect(container.getBoundingClientRect().height).toBeLessThan(320);
      await screen.getByRole("button", { name: /查看全部/ }).click();
      await expect.element(page.getByRole("button", { name: /Review 6/ })).toBeVisible();
    },
  );
});
