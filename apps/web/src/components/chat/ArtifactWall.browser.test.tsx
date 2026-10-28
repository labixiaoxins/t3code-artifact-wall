import type { EnvironmentId, ThreadId, WallArtifact } from "@t3tools/contracts";
import { describe, expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
import { ArtifactWall } from "./ArtifactWall";

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
  loadWallArtifacts: async () => ARTIFACTS,
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
