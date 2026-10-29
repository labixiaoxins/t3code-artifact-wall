import "~/index.css";
import type { EnvironmentId, ThreadId, WallArtifact } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { ArtifactWall } from "./ArtifactWall";
import { loadWallArtifacts } from "../../lib/artifactWallClient";

const ARTIFACTS = vi.hoisted(() => {
  const make = (id: string, name: string, extension: string, kind: string) => ({
    id,
    path: `/work/${name}`,
    name,
    extension,
    kind,
    source: "path_reference",
    createdAt: "2026-10-25T08:00:00.000Z",
    sizeBytes: 2048,
  });
  return [
    make("a1", "cover.png", "png", "image"),
    make("a2", "demo.mov", "mov", "video"),
    make("a3", "clip.mp4", "mp4", "video"),
    make("a4", "notes.md", "md", "document"),
    make("a5", "index.html", "html", "page"),
  ] as unknown as WallArtifact[];
});

vi.mock("../../lib/artifactWallClient", () => ({
  artifactFileUrl: () => null,
  fileFromArtifact: vi.fn(),
  loadWallArtifacts: vi.fn(async () => ARTIFACTS),
}));
vi.mock("../../state/session", () => ({ usePreparedConnection: () => null }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));

describe("ArtifactWall video filter", () => {
  it("lists video after images and filters to video artifacts", async () => {
    await using screen = await render(
      <ArtifactWall
        environmentId={"environment-local" as EnvironmentId}
        threadId={"thread-1" as ThreadId}
        onAttach={vi.fn()}
      />,
      // The wall only needs the mocked client; no routes are involved.
      { router: false },
    );
    const chips = await vi.waitFor(() => {
      const found = [
        ...screen.container.querySelectorAll<HTMLButtonElement>('[aria-label="产物类型"] button'),
      ];
      expect(found.map((chip) => chip.textContent)).toContain("视频 2");
      return found;
    });
    expect(chips.map((chip) => chip.textContent)).toEqual([
      "全部 5",
      "图片 1",
      "视频 2",
      "页面 1",
      "文档 1",
    ]);
    chips.find((chip) => chip.textContent === "视频 2")!.click();
    await vi.waitFor(() => {
      expect(screen.container.querySelectorAll("video").length).toBe(2);
      expect(screen.container.textContent).not.toContain("notes.md");
    });
  });

  it("shows images and videos as a 3-column thumbnail grid and documents as list rows", async () => {
    await using screen = await render(
      <ArtifactWall
        environmentId={"environment-local" as EnvironmentId}
        threadId={"thread-1" as ThreadId}
        onAttach={vi.fn()}
      />,
      { router: false },
    );
    await vi.waitFor(() => {
      expect(screen.container.querySelectorAll("[data-artifact-id]").length).toBe(5);
    });
    const grid = screen.container.querySelector(".grid-cols-3")!;
    expect(
      [...grid.querySelectorAll("[data-artifact-id]")].map((n) =>
        n.getAttribute("data-artifact-id"),
      ),
    ).toEqual(["a1", "a2", "a3"]);
    const rows = screen.container.querySelectorAll("li[data-artifact-id]");
    expect([...rows].map((n) => n.getAttribute("data-artifact-id"))).toEqual(["a4", "a5"]);
    // Check status is hover text now, not card text.
    expect(screen.container.textContent).not.toContain("未附检查记录");
  });

  it("renders nothing while inactive but still reports the artifact count", async () => {
    const onCount = vi.fn();
    await using screen = await render(
      <ArtifactWall
        environmentId={"environment-local" as EnvironmentId}
        threadId={"thread-1" as ThreadId}
        onAttach={vi.fn()}
        active={false}
        onCount={onCount}
      />,
      { router: false },
    );
    await vi.waitFor(() => expect(onCount).toHaveBeenCalledWith(5));
    expect(screen.container.querySelector("[data-artifact-wall]")).toBeNull();
  });
});

describe("ArtifactWall revision drafts", () => {
  it("hides feedback by default and preserves the draft when its visibility is toggled", async () => {
    const props = {
      environmentId: "environment-local" as EnvironmentId,
      threadId: "thread-1" as ThreadId,
      onAttach: vi.fn(),
      onRevise: vi.fn(() => true),
    };
    await using screen = await render(<ArtifactWall {...props} />, { router: false });
    await screen.getByRole("button", { name: "对比 cover.png", exact: true }).click();
    await expect.element(screen.getByRole("textbox", { name: "修改意见" })).not.toBeInTheDocument();
    await screen.rerender(<ArtifactWall {...props} revisionEnabled />);
    await screen.getByRole("textbox", { name: "修改意见" }).fill("保留构图，只调整边缘");
    await screen.rerender(<ArtifactWall {...props} revisionEnabled={false} />);
    await expect.element(screen.getByRole("textbox", { name: "修改意见" })).not.toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: "附加到输入框" })).toBeVisible();
    await screen.rerender(<ArtifactWall {...props} revisionEnabled />);
    await expect
      .element(screen.getByRole("textbox", { name: "修改意见" }))
      .toHaveValue("保留构图，只调整边缘");
    expect(props.onRevise).not.toHaveBeenCalled();
  });

  it("keeps the comparison divider keyboard-adjustable when feedback is off", async () => {
    const previous = {
      ...ARTIFACTS[0]!,
      id: "a6",
      name: "previous.png",
      path: "/work/previous.png",
    };
    vi.mocked(loadWallArtifacts).mockResolvedValueOnce([...ARTIFACTS, previous]);
    await using screen = await render(
      <ArtifactWall
        environmentId={"environment-local" as EnvironmentId}
        threadId={"thread-1" as ThreadId}
        onAttach={vi.fn()}
      />,
      { router: false },
    );
    await screen.getByRole("button", { name: "对比 cover.png", exact: true }).click();
    await screen.getByRole("button", { name: "选择对比 previous.png" }).click();
    const slider = document.querySelector<HTMLInputElement>('[aria-label="拖动中线对比"]')!;
    slider.focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect.element(screen.getByRole("slider", { name: "拖动中线对比" })).toHaveValue("51");
    await screen.getByRole("button", { name: "A 全图", exact: true }).click();
    await expect.element(screen.getByRole("slider")).not.toBeInTheDocument();
    await expect.element(document.querySelector<HTMLImageElement>('[data-artifact-compare] img[alt="previous.png"]')!).toBeVisible();
    await expect.element(document.querySelector<HTMLImageElement>('[data-artifact-compare] img[alt="cover.png"]')!).not.toBeVisible();
    await screen.getByRole("button", { name: "B 全图", exact: true }).click();
    await expect.element(document.querySelector<HTMLImageElement>('[data-artifact-compare] img[alt="cover.png"]')!).toBeVisible();
    await expect.element(document.querySelector<HTMLImageElement>('[data-artifact-compare] img[alt="previous.png"]')!).not.toBeVisible();
    await screen.getByRole("button", { name: "滑动对比", exact: true }).click();
    await expect.element(screen.getByRole("slider", { name: "拖动中线对比" })).toHaveValue("51");
    await screen.getByRole("button", { name: "单图查看" }).click();
    await expect.element(screen.getByRole("slider")).not.toBeInTheDocument();
  });

  it("keeps feedback when the composer is unavailable and permits retry", async () => {
    const onRevise = vi.fn().mockReturnValue(false);
    await using screen = await render(
      <ArtifactWall
        environmentId={"environment-local" as EnvironmentId}
        threadId={"thread-1" as ThreadId}
        onAttach={vi.fn()}
        onRevise={onRevise}
        revisionEnabled
      />,
      { router: false }, // The mocked wall does not navigate.
    );
    await screen.getByRole("button", { name: "对比 cover.png", exact: true }).click();
    await expect.element(screen.getByRole("button", { name: "加入返工草稿" })).toBeDisabled();
    await screen.getByRole("textbox", { name: "修改意见" }).fill("修正右手边缘");
    await screen.getByRole("button", { name: "加入返工草稿" }).click();
    await vi.waitFor(() => {
      expect(
        document.querySelector('[data-slot="dialog-popup"] [role="alert"]')?.textContent,
      ).toContain("修改意见已保留");
    });
    await expect
      .element(screen.getByRole("textbox", { name: "修改意见" }))
      .toHaveValue("修正右手边缘");
    onRevise.mockReturnValue(true);
    await screen.getByRole("button", { name: "加入返工草稿" }).click();
    await expect.element(screen.getByRole("textbox", { name: "修改意见" })).not.toBeInTheDocument();
    expect(onRevise.mock.calls.at(-1)?.[0]).toContain('"path": "/work/cover.png"');
  });
  it("retains an unsent note on closing and reopening the same image", async () => {
    await using screen = await render(
      <ArtifactWall
        environmentId={"environment-local" as EnvironmentId}
        threadId={"thread-1" as ThreadId}
        onAttach={vi.fn()}
        onRevise={() => true}
        revisionEnabled
      />,
      { router: false }, // The mocked wall does not navigate.
    );
    await screen.getByRole("button", { name: "对比 cover.png", exact: true }).click();
    await screen.getByRole("textbox", { name: "修改意见" }).fill("保留构图");
    await screen.getByRole("button", { name: "Esc 关闭" }).click();
    await screen.getByRole("button", { name: "对比 cover.png", exact: true }).click();
    await expect.element(screen.getByRole("textbox", { name: "修改意见" })).toHaveValue("保留构图");
  });
});
