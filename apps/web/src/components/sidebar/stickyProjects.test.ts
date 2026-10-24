import { describe, expect, it } from "@effect/vitest";
import {
  type StickyProjectIdentity,
  areStickyIdentitiesEqual,
  stickyProjectKey,
  addStickyProjectIdentity,
  removeStickyProjectIdentity,
  moveStickyProjectIdentity,
  moveStickyProjectGroup,
  isProjectSticky,
  resolveStickyProjects,
  filterArchivedGroupsByTitle,
} from "./stickyProjects.logic";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarThreadSummary } from "../../types";
import type { EnvironmentId, ProjectId, ThreadId } from "@t3tools/contracts";

describe("stickyProjects pure logic", () => {
  const p1: StickyProjectIdentity = {
    environmentId: "env-1",
    projectId: "proj-1",
  };
  const p2: StickyProjectIdentity = {
    environmentId: "env-1",
    projectId: "proj-2",
  };
  const p3: StickyProjectIdentity = {
    environmentId: "env-2",
    projectId: "proj-1",
  };

  it("handles identity comparison and key serialization", () => {
    expect(areStickyIdentitiesEqual(p1, { environmentId: "env-1", projectId: "proj-1" })).toBe(true);
    expect(areStickyIdentitiesEqual(p1, p2)).toBe(false);
    expect(areStickyIdentitiesEqual(p1, p3)).toBe(false);
    expect(stickyProjectKey(p1)).toBe("env-1:proj-1");
  });

  it("adds and deduplicates identities", () => {
    const list = [p1];
    const withP2 = addStickyProjectIdentity(list, p2);
    expect(withP2).toHaveLength(2);
    expect(withP2[1]).toEqual(p2);

    // Adding existing identity returns same list without duplicating
    const withP1Again = addStickyProjectIdentity(withP2, {
      environmentId: "env-1",
      projectId: "proj-1",
    });
    expect(withP1Again).toHaveLength(2);
  });

  it("removes identity cleanly", () => {
    const list = [p1, p2, p3];
    const afterRemove = removeStickyProjectIdentity(list, {
      environmentId: "env-1",
      projectId: "proj-2",
    });
    expect(afterRemove).toHaveLength(2);
    expect(afterRemove.map((i) => i.projectId)).toEqual(["proj-1", "proj-1"]);
    expect(afterRemove.map((i) => i.environmentId)).toEqual(["env-1", "env-2"]);
  });

  it("reorders identities up and down with boundary safeguards", () => {
    const list = [p1, p2, p3];

    // Move index 1 (p2) up -> [p2, p1, p3]
    const movedUp = moveStickyProjectIdentity(list, 1, "up");
    expect(movedUp.map((i) => i.projectId)).toEqual(["proj-2", "proj-1", "proj-1"]);

    // Move index 0 up -> does nothing
    expect(moveStickyProjectIdentity(movedUp, 0, "up")).toEqual(movedUp);

    // Move index 1 (p1) down -> [p2, p3, p1]
    const movedDown = moveStickyProjectIdentity(movedUp, 1, "down");
    expect(movedDown.map((i) => i.projectId)).toEqual(["proj-2", "proj-1", "proj-1"]);
    expect(movedDown[1]?.environmentId).toBe("env-2");
    expect(movedDown[2]?.environmentId).toBe("env-1");

    // Move last index down -> does nothing
    expect(moveStickyProjectIdentity(movedDown, 2, "down")).toEqual(movedDown);

    // Invalid index -> does nothing
    expect(moveStickyProjectIdentity(list, 99, "up")).toEqual(list);
    expect(moveStickyProjectIdentity(list, -1, "down")).toEqual(list);
  });

  it("checks project sticky state by direct identity and logical member refs", () => {
    const identities = [p1];

    // Direct match
    expect(
      isProjectSticky(identities, {
        environmentId: "env-1",
        id: "proj-1",
      }),
    ).toBe(true);

    // Logical group match via memberProjectRefs
    expect(
      isProjectSticky(identities, {
        environmentId: "group-env",
        id: "group-1",
        memberProjectRefs: [
          { environmentId: "env-1" as EnvironmentId, projectId: "proj-1" as ProjectId },
          { environmentId: "env-1" as EnvironmentId, projectId: "proj-other" as ProjectId },
        ],
      }),
    ).toBe(true);

    // Non-matching
    expect(
      isProjectSticky(identities, {
        environmentId: "env-1",
        id: "proj-999",
      }),
    ).toBe(false);
  });

  it("resolves sticky projects, auto-updates renames, limits recent threads, and tracks active project", () => {
    const dummySnapshot1: SidebarProjectSnapshot = {
      id: "proj-1" as ProjectId,
      environmentId: "env-1" as EnvironmentId,
      projectKey: "key-1",
      title: "My Project Renamed",
      displayName: "My Project Renamed",
      workspaceRoot: "/workspace/1",
      defaultModelSelection: null, scripts: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
      groupedProjectCount: 1,
      environmentPresence: "local-only",
      allRemoteMembersAreDesktopLocal: true,
      allRemoteMembersAreWsl: false,
      memberProjects: [],
      memberProjectRefs: [
        { environmentId: "env-1" as EnvironmentId, projectId: "proj-1" as ProjectId },
      ],
      remoteEnvironmentLabels: [],
    };

    const dummyThreads: SidebarThreadSummary[] = [
      {
        id: "t1" as ThreadId,
        environmentId: "env-1" as EnvironmentId,
        projectId: "proj-1" as ProjectId,
        title: "Thread 1 (Oldest)",
        createdAt: "2026-01-01T10:00:00Z",
        updatedAt: "2026-01-01T10:00:00Z",
        archivedAt: null,
      } as SidebarThreadSummary,
      {
        id: "t2" as ThreadId,
        environmentId: "env-1" as EnvironmentId,
        projectId: "proj-1" as ProjectId,
        title: "Thread 2 (Newest)",
        createdAt: "2026-01-03T10:00:00Z",
        updatedAt: "2026-01-03T12:00:00Z",
        archivedAt: null,
      } as SidebarThreadSummary,
      {
        id: "t3" as ThreadId,
        environmentId: "env-1" as EnvironmentId,
        projectId: "proj-1" as ProjectId,
        title: "Thread 3 (Archived)",
        createdAt: "2026-01-04T10:00:00Z",
        updatedAt: "2026-01-04T12:00:00Z",
        archivedAt: "2026-01-04T13:00:00Z",
      } as SidebarThreadSummary,
      {
        id: "t4" as ThreadId,
        environmentId: "env-1" as EnvironmentId,
        projectId: "proj-1" as ProjectId,
        title: "Thread 4 (Middle)",
        createdAt: "2026-01-02T10:00:00Z",
        updatedAt: "2026-01-02T11:00:00Z",
        archivedAt: null,
      } as SidebarThreadSummary,
      {
        id: "t5" as ThreadId,
        environmentId: "env-1" as EnvironmentId,
        projectId: "proj-1" as ProjectId,
        title: "Thread 5 (Old)",
        createdAt: "2026-01-01T12:00:00Z",
        updatedAt: "2026-01-01T13:00:00Z",
        archivedAt: null,
      } as SidebarThreadSummary,
    ];

    const threadsByProjectKey = new Map<string, SidebarThreadSummary[]>([
      ["key-1", dummyThreads],
    ]);

    const resolved = resolveStickyProjects({
      identities: [p1, p3], // p3 is not in sidebarProjects
      sidebarProjects: [dummySnapshot1],
      threadsByProjectKey,
      activeProjectKey: "key-1",
    });

    expect(resolved).toHaveLength(2);

    // p1 is resolved and available
    const item1 = resolved[0]!;
    expect(item1.isAvailable).toBe(true);
    expect(item1.title).toBe("My Project Renamed");
    expect(item1.isDefaultExpanded).toBe(true);
    // Archived thread t3 must be excluded; total unarchived is 4 (t1, t2, t4, t5)
    expect(item1.totalThreadCount).toBe(4);
    // Recent threads capped at 3, sorted by recent activity descending: t2, t4, t5
    expect(item1.recentThreads).toHaveLength(3);
    expect(item1.recentThreads.map((t) => t.id)).toEqual(["t2", "t4", "t5"]);

    // p3 is unavailable
    const item2 = resolved[1]!;
    expect(item2.isAvailable).toBe(false);
    expect(item2.recentThreads).toHaveLength(0);
    expect(item2.isDefaultExpanded).toBe(false);
  });

  it("filters archived threads by search title and hides empty groups", () => {
    const groups = [
      {
        project: { title: "Project Alpha" },
        threads: [
          { title: "Fix login authentication error" },
          { title: "Add sidebar icon" },
        ],
      },
      {
        project: { title: "Project Beta" },
        threads: [
          { title: "Database migration script" },
        ],
      },
    ];

    // Empty query returns all
    expect(filterArchivedGroupsByTitle(groups, "")).toEqual(groups);
    expect(filterArchivedGroupsByTitle(groups, "   ")).toEqual(groups);

    // Search "login"
    const searchLogin = filterArchivedGroupsByTitle(groups, "login");
    expect(searchLogin).toHaveLength(1);
    expect(searchLogin[0]?.threads).toHaveLength(1);
    expect(searchLogin[0]?.threads[0]?.title).toBe("Fix login authentication error");

    // Search "sidebar"
    const searchSidebar = filterArchivedGroupsByTitle(groups, "SIDEBAR");
    expect(searchSidebar).toHaveLength(1);
    expect(searchSidebar[0]?.threads[0]?.title).toBe("Add sidebar icon");

    // Search nonexistent
    const searchNone = filterArchivedGroupsByTitle(groups, "nonexistent");
    expect(searchNone).toHaveLength(0);
  });
  it("reorders visible logical groups without swapping a hidden member", () => {
    const a = { environmentId: "env-a", projectId: "a" };
    const a2 = { environmentId: "env-b", projectId: "a2" };
    const b = { environmentId: "env-a", projectId: "b" };
    const c = { environmentId: "env-a", projectId: "c" };
    expect(moveStickyProjectGroup([a, a2, b, c], ["A", "A", "B", "C"], "B", "up")).toEqual([b, a, a2, c]);
    expect(moveStickyProjectGroup([a, a2, b, c], ["A", "A", "B", "C"], "A", "down")).toEqual([b, a, a2, c]);
    expect(moveStickyProjectGroup([a, b], ["A", "B"], "A", "up")).toEqual([a, b]);
  });

});
