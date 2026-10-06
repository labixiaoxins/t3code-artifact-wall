import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { buildWorkspaceCollections } from "./workspaceCollections";
import {
  buildSidebarProjectSnapshots,
  buildPhysicalToLogicalProjectKeyMap,
} from "./sidebarProjectGrouping";
import { groupSidebarByProvider } from "./sidebarProviderGrouping";
import { recentProjectRecords } from "./recentProjectRecords";
import type { Project, SidebarThreadSummary } from "./types";
const env = EnvironmentId.make("local");
const settings = {
  sidebarProjectGroupingMode: "repository" as const,
  sidebarProjectGroupingOverrides: {},
};
const project = (id: string, path: string, environmentId = env): Project => ({
  id: ProjectId.make(id),
  environmentId,
  title: id,
  workspaceRoot: path,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  repositoryIdentity: null,
});
const thread = (id: string, projectId: string, date: string, title = id): SidebarThreadSummary =>
  ({
    id: ThreadId.make(id),
    environmentId: env,
    projectId: ProjectId.make(projectId),
    title,
    createdAt: date,
    updatedAt: "2026-12-30T00:00:00Z",
    latestUserMessageAt: date,
    archivedAt: null,
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-6.1-sol" },
  }) as SidebarThreadSummary;

describe("workspace collections and recent projects", () => {
  it("keeps every workspace identity while collecting dated folders and preserving machine boundaries", () => {
    const projects = [
      project("root", "/Users/a/Documents/Codex"),
      project("n", "/Users/a/Documents/Codex/2026-09-27/n"),
      project("new", "/Users/a/Documents/Codex/2026-10-02/new-chat"),
      project("remote", "/Users/b/Documents/Codex", EnvironmentId.make("remote")),
    ];
    const groups = buildWorkspaceCollections({ projects, settings });
    expect(groups).toHaveLength(2);
    expect(groups[0]?.representative.id).toBe("root");
    expect(groups[0]?.memberProjectRefs).toHaveLength(3);
    expect(groups.flatMap((g) => g.memberProjectRefs)).toHaveLength(4);
    const mapping = buildPhysicalToLogicalProjectKeyMap({
      projects,
      settings,
      primaryEnvironmentId: env,
    });
    expect(new Set(mapping.values()).size).toBe(2);
    // Changing defaults in settings must still target the actual workspace.
    const physical = buildSidebarProjectSnapshots({
      projects,
      settings,
      primaryEnvironmentId: env,
      resolveEnvironmentLabel: () => null,
      workspaceCollections: false,
    });
    expect(physical).toHaveLength(4);
    expect(physical.every((g) => g.memberProjects.length === 1)).toBe(true);
    expect(physical.find((g) => g.id === "n")?.displayName).toBe("n");
  });
  it("collects automation from business projects into one provider bucket without losing or duplicating threads", () => {
    const projects = [
      project("trade", "/Users/a/Documents/交易"),
      project("work", "/Users/a/Documents/Codex"),
    ];
    const threads = [
      thread("research", "trade", "2026-10-03T00:00:00Z", "market research"),
      thread("job1", "trade", "2026-10-04T00:00:00Z", "自动审批记录"),
      thread("job2", "work", "2026-10-04T00:00:00Z", "自动化测试"),
    ];
    const groups = groupSidebarByProvider(
      buildSidebarProjectSnapshots({
        projects,
        settings,
        primaryEnvironmentId: env,
        resolveEnvironmentLabel: () => null,
      }),
      threads,
      new Map(),
    );
    const automation = groups.filter((g) => g.displayName === "自动化与测试");
    expect(automation).toHaveLength(1);
    expect(automation[0]?.providerThreadKeys?.size).toBe(2);
    const all = groups.flatMap((g) => [...g.providerThreadKeys!]);
    expect(all).toHaveLength(3);
    expect(new Set(all).size).toBe(3);
    expect(recentProjectRecords(groups, threads).map((r) => r.thread.id)).toEqual(["research"]);
  });
  it("uses actual conversations for recent projects, not rename/import timestamps, with one entry per collection", () => {
    const projects = [
      project("content", "/Users/a/Documents/自媒体"),
      project("notes", "/Users/a/Documents/自媒体/notes"),
      project("work", "/Users/a/Documents/Codex"),
    ];
    const threads = [
      thread("old", "content", "2026-01-01T00:00:00Z"),
      thread("recent", "notes", "2026-10-03T00:00:00Z"),
      thread("now", "work", "2026-10-04T00:00:00Z"),
    ];
    const groups = groupSidebarByProvider(
      buildSidebarProjectSnapshots({
        projects,
        settings,
        primaryEnvironmentId: env,
        resolveEnvironmentLabel: () => null,
      }),
      threads,
      new Map(),
    );
    expect(recentProjectRecords(groups, threads).map((r) => r.thread.id)).toEqual([
      "now",
      "recent",
    ]);
    expect(recentProjectRecords(groups, threads)[1]?.project.memberProjectRefs).toHaveLength(2);
  });
});
