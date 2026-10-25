import { describe, expect, it } from "vite-plus/test";
import type { WallArtifact } from "@t3tools/contracts";
import {
  artifactCounts,
  groupArtifacts,
  previousArtifactImage,
  isArtifactVideo,
  artifactVideoDuration,
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
