import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import {
  scopedThreadKey,
  scopeThreadRef,
  scopeProjectRef,
} from "@t3tools/client-runtime/environment";
import { groupSidebarByProvider, prioritizeUserThreads } from "./sidebarProviderGrouping";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";

const environmentId = EnvironmentId.make("local");
const id = ProjectId.make("project");
const project: SidebarProjectSnapshot = {
  id,
  environmentId,
  title: "项目管理",
  displayName: "项目管理",
  workspaceRoot: "/projects/design",
  projectKey: "design",
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  groupedProjectCount: 1,
  environmentPresence: "local-only",
  allRemoteMembersAreDesktopLocal: false,
  allRemoteMembersAreWsl: false,
  memberProjects: [],
  memberProjectRefs: [scopeProjectRef(environmentId, id)],
  remoteEnvironmentLabels: [],
};
const thread = (name: string, provider: string, env = environmentId) => ({
  id: ThreadId.make(name),
  environmentId: env,
  projectId: id,
  modelSelection: { instanceId: ProviderInstanceId.make(provider), model: "example-model" },
});

describe("provider project tree", () => {
  it("splits a shared project without duplicating or losing conversations", () => {
    const rows = groupSidebarByProvider(
      [project],
      [thread("one", "codex"), thread("two", "claudeAgent"), thread("three", "grok")],
      new Map(),
    );
    expect(rows.map((row) => row.providerLabel)).toEqual(["Codex", "Claude", "Grok"]);
    expect(new Set(rows.map((row) => row.projectKey)).size).toBe(3);
    expect(rows.every((row) => row.id === id && row.sourceProjectKey === "design")).toBe(true);
    expect(rows.map((row) => row.providerThreadKeys?.size)).toEqual([1, 1, 1]);
    expect(new Set(rows.flatMap((row) => [...row.providerThreadKeys!])).size).toBe(3);
  });

  it("keeps an empty project visible and does not mix identical IDs on another machine", () => {
    const rows = groupSidebarByProvider(
      [project],
      [thread("remote", "claudeAgent", EnvironmentId.make("remote"))],
      new Map(),
    );
    expect(rows.map((row) => row.providerLabel)).toEqual(["Codex"]);
    expect(rows[0]?.providerThreadKeys?.size).toBe(0);
  });
  it("groups custom instances by their configured harness and leaves automated reviews after user threads", () => {
    const custom = ProviderInstanceId.make("claude-work");
    const configs = new Map([
      [
        environmentId,
        {
          settings: {
            ...DEFAULT_SERVER_SETTINGS,
            providerInstances: { [custom]: { driver: ProviderDriverKind.make("claudeAgent") } },
          },
        },
      ],
    ]);
    const rows = groupSidebarByProvider([project], [thread("work", "claude-work")], configs);
    expect(rows[0]?.providerLabel).toBe("Claude");
    const review = {
      ...thread("review", "codex"),
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "codex-auto-review" },
    };
    expect(prioritizeUserThreads([review, thread("human", "codex")]).map((t) => t.id)).toEqual([
      "human",
      "review",
    ]);
    const reviewOnly = groupSidebarByProvider([project], [review], new Map());
    expect(reviewOnly[0]?.providerModelSelection?.model).not.toBe("codex-auto-review");
  });
});

describe("manual sidebar placement", () => {
  const destination = {
    ...project,
    id: ProjectId.make("media"),
    projectKey: "media",
    displayName: "自媒体",
    memberProjectRefs: [scopeProjectRef(environmentId, ProjectId.make("media"))],
  };
  it("moves only the selected conversation, preserves provider and workspace identity, and restores without duplicates", () => {
    const moving = thread("move-me", "claudeAgent");
    const staying = thread("stay", "codex");
    const before = structuredClone(moving);
    const key = scopedThreadKey(scopeThreadRef(environmentId, moving.id));
    const rows = groupSidebarByProvider([project, destination], [moving, staying], new Map(), {
      [key]: "media",
    });
    const containing = rows.filter((row) => row.providerThreadKeys?.has(key));
    expect(containing).toHaveLength(1);
    expect(containing[0]).toMatchObject({ sourceProjectKey: "media", providerLabel: "Claude" });
    expect(moving).toEqual(before);
    const restored = groupSidebarByProvider([project, destination], [moving, staying], new Map());
    expect(restored.find((row) => row.providerThreadKeys?.has(key))?.sourceProjectKey).toBe(
      "design",
    );
    expect(rows.flatMap((row) => [...row.providerThreadKeys!])).toHaveLength(2);
  });
  it("falls back to the original project for missing or cross-environment targets", () => {
    const moving = thread("move-me", "codex");
    const key = scopedThreadKey(scopeThreadRef(environmentId, moving.id));
    for (const target of ["gone", "remote"]) {
      const rows = groupSidebarByProvider(
        [
          project,
          { ...destination, projectKey: "remote", environmentId: EnvironmentId.make("remote") },
        ],
        [moving],
        new Map(),
        { [key]: target },
      );
      expect(
        rows.filter((row) => row.providerThreadKeys?.has(key)).map((row) => row.sourceProjectKey),
      ).toEqual(["design"]);
    }
  });
  it("lets an explicit move override automatic classification without changing the model", () => {
    const moving = { ...thread("review", "codex"), title: "自动审批记录" };
    const key = scopedThreadKey(scopeThreadRef(environmentId, moving.id));
    const rows = groupSidebarByProvider([project, destination], [moving], new Map(), {
      [key]: "media",
    });
    expect(rows.find((row) => row.providerThreadKeys?.has(key))?.displayName).toBe("自媒体");
  });
});
