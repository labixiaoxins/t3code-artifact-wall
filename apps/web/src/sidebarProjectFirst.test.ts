import { describe, expect, it } from "vite-plus/test";
import {
  PROJECT_FIRST_LABEL,
  mergeSnapshotsByProject,
  parsePinnedProjects,
  parseSidebarGrouping,
  partitionProjects,
  togglePinnedProject,
} from "./sidebarProjectFirst";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-25T08:00:00.000Z");
const snap = (displayName: string, extra: Partial<SidebarProjectSnapshot> = {}) =>
  ({
    environmentId: "env",
    displayName,
    projectKey: `p:${displayName}`,
    memberProjects: [{ physicalProjectKey: `phys:${displayName}` }],
    memberProjectRefs: [{ environmentId: "env", projectId: displayName }],
    groupedProjectCount: 1,
    ...extra,
  }) as unknown as SidebarProjectSnapshot;
const names = (list: SidebarProjectSnapshot[]) => list.map((project) => project.displayName);

describe("preferences", () => {
  it("defaults to project grouping and only reads 'model' as the opt-out", () => {
    expect(parseSidebarGrouping(null)).toBe("project");
    expect(parseSidebarGrouping("garbage")).toBe("project");
    expect(parseSidebarGrouping("model")).toBe("model");
  });
  it("ignores corrupt or duplicate pinned entries and round-trips pin/unpin", () => {
    expect(parsePinnedProjects("{")).toEqual([]);
    expect(parsePinnedProjects('{"a":1}')).toEqual([]);
    expect(
      parsePinnedProjects('[{"key":"a","at":2},{"key":"a","at":3},{"key":7},{"key":"b"}]'),
    ).toEqual([
      { key: "a", at: 2 },
      { key: "b", at: 0 },
    ]);
    const pinned = togglePinnedProject([], "a", 5);
    expect(pinned).toEqual([{ key: "a", at: 5 }]);
    expect(togglePinnedProject(pinned, "a", 9)).toEqual([]);
  });
});

describe("mergeSnapshotsByProject", () => {
  it("joins the per-model slices of one project and unions their threads", () => {
    const codex = snap("AI 工作台", {
      projectKey: '["provider-project","Codex","src"]',
      sourceProjectKey: "src",
      providerLabel: "Codex",
      providerThreadKeys: new Set(["t1"]),
    });
    const claude = snap("AI 工作台", {
      projectKey: '["provider-project","Claude","src"]',
      sourceProjectKey: "src",
      providerLabel: "Claude",
      providerThreadKeys: new Set(["t2"]),
    });
    const merged = mergeSnapshotsByProject([
      codex,
      claude,
      snap("交易", { sourceProjectKey: "x" }),
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.providerLabel).toBe(PROJECT_FIRST_LABEL);
    expect([...merged[0]!.providerThreadKeys!]).toEqual(["t1", "t2"]);
    // The inputs are not mutated.
    expect([...codex.providerThreadKeys!]).toEqual(["t1"]);
  });
  it("treats per-model automation collections as one project", () => {
    const make = (label: string, thread: string) =>
      snap("自动化与测试", {
        projectKey: `["provider-project","${label}","a"]`,
        sourceProjectKey: `["automation-collection","env","${label}"]`,
        providerLabel: label,
        providerThreadKeys: new Set([thread]),
      });
    expect(mergeSnapshotsByProject([make("Codex", "a"), make("Claude", "b")])).toHaveLength(1);
  });
});

describe("partitionProjects", () => {
  const projects = [
    snap("旧"),
    snap("新"),
    snap("置顶A"),
    snap("置顶B"),
    snap("其他项目"),
    snap("空"),
  ];
  const last = new Map([
    ["p:旧", NOW - 30 * DAY],
    ["p:新", NOW - 1 * DAY],
    ["p:其他项目", NOW - 0.5 * DAY],
    ["p:置顶A", NOW - 40 * DAY],
    ["p:置顶B", NOW - 2 * DAY],
  ]);
  const input = {
    projects,
    lastActivityByKey: last,
    now: NOW,
    sortByActivity: true,
  };
  it("pins first by pin time (even when quiet), then recent by activity, then quiet ones", () => {
    const sections = partitionProjects({
      ...input,
      pinned: [
        { key: "p:置顶B", at: 2 },
        { key: "p:置顶A", at: 1 },
      ],
    });
    expect(names(sections.pinned)).toEqual(["置顶A", "置顶B"]);
    expect(names(sections.recent)).toEqual(["新", "空", "其他项目"]);
    expect(names(sections.more)).toEqual(["旧"]);
  });
  it("keeps the incoming order when the user sorts manually", () => {
    const sections = partitionProjects({ ...input, pinned: [], sortByActivity: false });
    expect(names(sections.recent)).toEqual(["新", "置顶B", "其他项目", "空"]);
    expect(names(sections.more)).toEqual(["旧", "置顶A"]);
  });
  it("unpinning returns a project to the section its activity decides", () => {
    const pinned = partitionProjects({ ...input, pinned: [{ key: "p:新", at: 1 }] });
    expect(names(pinned.pinned)).toEqual(["新"]);
    const unpinned = partitionProjects({ ...input, pinned: [] });
    expect(names(unpinned.recent)).toContain("新");
  });
});
