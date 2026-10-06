import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId, ThreadId, ProviderInstanceId, RunId } from "@t3tools/contracts";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { makeThreadFixture } from "./test-fixtures";
import {
  buildSubtaskTree,
  groupSidebarWithSubtasks,
  subtaskDescendants,
  subtaskThreadKey,
  mutateSubtasks,
} from "./sidebarSubtasks";
import {
  groupAttentionCounts,
  sortedAttentionThreads,
  nextAttentionThread,
  attentionThreadLabel,
} from "./sidebarInboxPresentation";
import { inboxReason } from "./workbenchInbox";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";
const env = EnvironmentId.make("local");
const parent = makeThreadFixture({
  environmentId: env,
  id: ThreadId.make("parent"),
  title: "父会话",
  projectId: ProjectId.make("original"),
});
const child = (id: string, patch: Parameters<typeof makeThreadFixture>[0] = {}) =>
  makeThreadFixture({
    environmentId: env,
    id: ThreadId.make(id),
    title: id,
    projectId: ProjectId.make("child-project"),
    modelSelection: { instanceId: ProviderInstanceId.make("claudeAgent"), model: "test" },
    lineage: {
      parentThreadId: parent.id,
      rootThreadId: parent.id,
      relationshipToParent: "subagent",
    },
    ...patch,
  });
const run = (status: "failed" | "completed") => ({
  runId: RunId.make("run"),
  status,
  requestedAt: null,
  startedAt: null,
  completedAt: "2026-10-06T10:00:00Z",
  assistantMessageId: null,
});
const project = (id: string): SidebarProjectSnapshot => ({
  id: ProjectId.make(id),
  environmentId: env,
  title: id,
  displayName: id,
  workspaceRoot: `/fiction/${id}`,
  projectKey: id,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  groupedProjectCount: 1,
  environmentPresence: "local-only",
  allRemoteMembersAreDesktopLocal: false,
  allRemoteMembersAreWsl: false,
  memberProjects: [],
  memberProjectRefs: [scopeProjectRef(env, ProjectId.make(id))],
  remoteEnvironmentLabels: [],
});
describe("subtask sidebar tree", () => {
  it("keeps children under parents across provider/project placements, with fork rows independent", () => {
    const c = child("c"),
      fork = child("fork", {
        lineage: { ...parent.lineage, parentThreadId: parent.id, relationshipToParent: "fork" },
      });
    const tree = buildSubtaskTree([parent, c, fork]);
    expect(tree.roots.map((t) => t.id)).toEqual([parent.id, fork.id]);
    expect(tree.children.get(subtaskThreadKey(parent))).toEqual([c]);
    const groups = groupSidebarWithSubtasks(
      [project("original"), project("child-project"), project("moved")],
      [parent, c, fork],
      new Map(),
      { [subtaskThreadKey(parent)]: "moved", [subtaskThreadKey(c)]: "child-project" },
    );
    const owner = groups.find((g) => g.providerThreadKeys?.has(subtaskThreadKey(c)));
    expect(owner?.sourceProjectKey).toBe("moved");
    expect(owner?.providerLabel).toBe("Codex");
    expect(groups.filter((g) => g.providerThreadKeys?.has(subtaskThreadKey(c)))).toHaveLength(1);
  });
  it("retains archived parents as anchors and nests children independent of preview truncation", () => {
    const archived = { ...parent, archivedAt: "2026-10-05" };
    const c = child("c");
    const tree = buildSubtaskTree([archived, c]);
    expect(tree.roots).toEqual([archived]);
    expect(tree.needed.has(subtaskThreadKey(c))).toBe(true);
    expect(buildSubtaskTree([archived, { ...c, archivedAt: "2026-10-05" }]).roots).toEqual([]);
  });
  it("preserves orphan/deleted-parent/cyclic children and scopes parents by environment", () => {
    const c = child("c");
    expect(buildSubtaskTree([c]).roots).toEqual([c]);
    expect(buildSubtaskTree([{ ...parent, deletedAt: "2026-10-05" }, c]).roots).toEqual([c]);
    expect(
      buildSubtaskTree([{ ...parent, environmentId: EnvironmentId.make("remote") }, c]).roots,
    ).toHaveLength(2);
    const cyclicParent = {
      ...parent,
      lineage: {
        ...parent.lineage,
        parentThreadId: c.id,
        relationshipToParent: "subagent" as const,
      },
    };
    expect(buildSubtaskTree([cyclicParent, c]).roots).toHaveLength(2);
  });
  it("handles archived intermediates without losing a live grandchild", () => {
    const middle = child("middle", { archivedAt: "2026-10-05" });
    const grandchild = child("grandchild", {
      lineage: { ...middle.lineage, parentThreadId: middle.id },
    });
    const tree = buildSubtaskTree([parent, middle, grandchild]);
    expect(tree.roots).toEqual([parent]);
    expect(tree.needed.has(subtaskThreadKey(middle))).toBe(true);
    expect(subtaskDescendants([parent, middle, grandchild], parent, false)).toEqual([grandchild]);
  });
});
describe("subtask inbox and archive lifecycle", () => {
  it("filters child results and failures but retains child permission/answer requests everywhere", () => {
    const complete = child("complete", {
      latestRun: run("completed"),
      lastVisitedAt: "2026-10-05",
    });
    const failed = child("failed", { latestRun: run("failed") });
    const permission = child("permission", { hasPendingApprovals: true });
    const answer = child("answer", { hasPendingUserInput: true });
    const all = [parent, complete, failed, permission, answer];
    expect(inboxReason(complete)).toBeNull();
    expect(inboxReason(failed)).toBeNull();
    const attention = sortedAttentionThreads(all, {});
    expect(attention.map((t) => t.id).sort()).toEqual([answer.id, permission.id].sort());
    expect(groupAttentionCounts(all, {})).toEqual({ requests: 2, errors: 0 });
    expect(nextAttentionThread(attention, null)?.id).toBe(answer.id);
    expect(attentionThreadLabel(permission, all, "待授权")).toEqual({
      title: "父会话",
      detail: "子任务 · 待授权",
    });
    expect(attentionThreadLabel(permission, [permission], "待授权").title).toBe(permission.title);
  });
  it("archives only unarchived subagents; restore planning leaves forks and parent untouched", async () => {
    const a = child("a"),
      archived = child("archived", { archivedAt: "2026-10-05" }),
      fork = child("fork", {
        lineage: { ...parent.lineage, parentThreadId: parent.id, relationshipToParent: "fork" },
      });
    const all = [parent, a, archived, fork];
    const calls: string[] = [];
    const failures = await mutateSubtasks(
      subtaskDescendants(all, parent, false),
      (thread) => {
        calls.push(thread.id);
        return Promise.resolve(true);
      },
      (ok) => !ok,
    );
    expect(calls).toEqual(["a"]);
    expect(failures).toEqual([]);
    expect(subtaskDescendants(all, parent, true)).toEqual([archived]);
    // A parent unarchive runs just its own mutation; restoration is a separate explicit plan.
    expect(all[2]?.archivedAt).toBe("2026-10-05");
  });
  it("runs sequentially and records rejected/throwing children while continuing remaining mutations", async () => {
    const calls: number[] = [];
    let inFlight = 0;
    const failures = await mutateSubtasks(
      [1, 2, 3, 4],
      async (n) => {
        expect(inFlight).toBe(0);
        inFlight++;
        calls.push(n);
        await Promise.resolve();
        inFlight--;
        if (n === 2) throw new Error("fictional");
        return n !== 3;
      },
      (ok) => !ok,
    );
    expect(calls).toEqual([1, 2, 3, 4]);
    expect(failures.map((f) => f.thread)).toEqual([2, 3]);
  });
});
