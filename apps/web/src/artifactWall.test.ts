import { describe, expect, it } from "vite-plus/test";
import type { WallArtifact } from "@t3tools/contracts";
import {
  artifactCounts,
  artifactRevisionPrompt,
  artifactVersionKey,
  groupArtifacts,
  previousArtifactImage,
  isArtifactVideo,
  artifactVideoDuration,
  nextArtifactCount,
} from "./artifactWall";
const a = (
  id: string,
  createdAt: string,
  kind: WallArtifact["kind"] = "image",
  threadId = "fiction",
): WallArtifact => ({
  id,
  createdAt,
  kind,
  threadId,
  path: `/fiction/${id}.png`,
  name: id,
  extension: "png",
  source: "path_reference",
  sizeBytes: 1,
});
describe("artifact wall presentation", () => {
  it("groups local calendar days and sorts latest first across midnight", () => {
    const now = new Date(2026, 9, 6, 10);
    const today = new Date(2026, 9, 6, 8).toISOString();
    const yesterday = new Date(2026, 9, 5, 23).toISOString();
    const groups = groupArtifacts([a("old", yesterday), a("new", today)], now);
    expect(groups.map((g) => g.label)).toEqual(["今天", "昨天"]);
    expect(groups[0]?.artifacts[0]?.id).toBe("new");
  });
  it("surfaces a revised old deliverable before an untouched newer reference", () => {
    const revised = { ...a("old", "2026-10-05T01:00:00Z"), modifiedAt: "2026-10-07T10:00:00Z" };
    const other = { ...a("other", "2026-10-06T10:00:00Z"), modifiedAt: "2026-10-06T10:00:00Z" };
    const groups = groupArtifacts([other, revised], new Date("2026-10-07T12:00:00Z"));
    expect(groups[0]?.artifacts[0]?.id).toBe("old");
    expect(previousArtifactImage(revised, [other, revised])?.id).toBe("other");
  });
  it("keeps the same count state object when the count is unchanged", () => {
    const first = nextArtifactCount(null, "env:thread", 2);
    expect(nextArtifactCount(first, "env:thread", 2)).toBe(first);
    expect(nextArtifactCount(first, "env:thread", 3)).toEqual({ key: "env:thread", count: 3 });
    expect(nextArtifactCount(first, "env:other", 2)).toEqual({ key: "env:other", count: 2 });
  });
  it("counts each kind including video", () => {
    expect(
      artifactCounts([
        a("a", "1"),
        a("b", "2", "page"),
        a("c", "3", "document"),
        a("d", "4", "video"),
      ]),
    ).toEqual({
      all: 4,
      image: 1,
      video: 1,
      page: 1,
      document: 1,
    });
  });
  it("defaults to nearest older image in the selected image's own thread", () => {
    const selected = a("new", "2026-10-06T03:00:00Z");
    const previous = a("previous", "2026-10-06T02:00:00Z");
    expect(
      previousArtifactImage(selected, [
        selected,
        previous,
        a("other", "2026-10-06T02:30:00Z", "image", "other-thread"),
        a("older", "2026-10-06T01:00:00Z"),
        a("doc", "2026-10-06T02:59:00Z", "document"),
      ]),
    ).toEqual(previous);
    expect(previousArtifactImage(previous, [selected, previous])).toBeNull();
  });
});

describe("video presentation", () => {
  it("identifies only video-kind artifacts", () => {
    expect(isArtifactVideo({ kind: "video" })).toBe(true);
    expect(isArtifactVideo({ kind: "document" })).toBe(false);
  });
  it("formats metadata duration and handles unknown/non-finite media", () => {
    expect(artifactVideoDuration(65.9)).toBe("1:05");
    expect(artifactVideoDuration(0)).toBe("0:00");
    expect(artifactVideoDuration(3601)).toBe("60:01");
    expect(artifactVideoDuration(NaN)).toBeNull();
    expect(artifactVideoDuration(Infinity)).toBeNull();
    expect(artifactVideoDuration(-1)).toBeNull();
  });
});

describe("artifact revision request", () => {
  it("binds the request to the selected file and asks to retain the original", () => {
    const artifact = { ...a("v2", "2026-10-29T00:00:00Z"), revision: "sha256:abc" };
    const prompt = artifactRevisionPrompt(artifact, "  修右手边缘\n保留构图  ");
    expect(prompt).toContain('"path": "/fiction/v2.png"');
    expect(prompt).toContain('"sourceThreadId": "fiction"');
    expect(prompt).toContain('"revision": "sha256:abc"');
    expect(prompt).toContain("修右手边缘\n保留构图");
    expect(prompt).not.toContain("artifactId");
    expect(prompt).toContain("保留原文件");
    expect(prompt).toContain("等待我对比验收");
  });
  it("rejects blank feedback instead of starting an unspecified revision", () => {
    expect(() => artifactRevisionPrompt(a("v1", "2026-10-29"), "  ")).toThrow();
  });
});

describe("artifact stable version identity", () => {
  it("ignores renewed access capabilities but distinguishes changed files and threads", () => {
    const original = { ...a("capability-a", "2026-10-29"), revision: "revision-1" };
    expect(artifactVersionKey({ ...original, id: "capability-b" })).toBe(
      artifactVersionKey(original),
    );
    for (const changed of [
      { ...original, revision: "revision-2" },
      { ...original, path: "/other.png" },
      { ...original, threadId: "other-thread" },
      { ...original, sizeBytes: 100 },
    ])
      expect(artifactVersionKey(changed)).not.toBe(artifactVersionKey(original));
  });
});
