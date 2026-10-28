import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { makeThreadFixture } from "./test-fixtures";
import { activeWorkStatus, collectActiveWork } from "./sidebarActiveWork";

const runtime = (status: "running" | "idle" | "queued" | "failed" | "waiting") => ({
  status,
  activeRunId: null,
  providerInstanceId: ProviderInstanceId.make("codex"),
  providerName: "Codex",
  lastError: null,
  updatedAt: "2026-10-23T10:00:00Z",
});
const root = makeThreadFixture({ id: ThreadId.make("parent"), title: "Parent" });
const child = (id: string, extra: Parameters<typeof makeThreadFixture>[0] = {}) =>
  makeThreadFixture({
    id: ThreadId.make(id),
    title: id,
    environmentId: root.environmentId,
    modelSelection: { instanceId: ProviderInstanceId.make("claudeAgent"), model: "test" },
    lineage: { parentThreadId: root.id, rootThreadId: root.id, relationshipToParent: "subagent" },
    runtime: runtime("running"),
    ...extra,
  });

describe("cross-provider active work", () => {
  it("retains an idle parent when a different provider is working beneath it", () => {
    const c = child("claude-child");
    const groups = collectActiveWork([{ ...root, runtime: runtime("idle") }, c]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.root.id).toBe(root.id);
    expect(groups[0]!.children).toEqual([c]);
    expect(groups[0]!.children[0]!.modelSelection.instanceId).toBe("claudeAgent");
  });
  it("keeps a grandchild reachable without promoting intermediate ancestors to separate roots", () => {
    const c = child("middle", { runtime: runtime("idle") });
    const grandchild = child("grandchild", { lineage: { ...c.lineage, parentThreadId: c.id } });
    expect(collectActiveWork([root, c, grandchild])[0]!.children).toEqual([grandchild]);
  });
  it("shows waiting-for-children and human requests without calling them working", () => {
    expect(
      activeWorkStatus({ ...root, runtime: runtime("running"), blockedOnThreadWait: true }),
    ).toBe("等待任务");
    expect(
      activeWorkStatus({ ...root, runtime: runtime("running"), hasPendingApprovals: true }),
    ).toBe("待授权");
    expect(
      activeWorkStatus({ ...root, runtime: runtime("running"), hasPendingUserInput: true }),
    ).toBe("待回答");
    expect(activeWorkStatus({ ...root, runtime: runtime("queued") })).toBe("排队中");
  });
  it("removes settled work, ignores deleted threads and leaves failures to the inbox", () => {
    expect(
      collectActiveWork([
        root,
        child("done", { runtime: runtime("idle") }),
        child("failed", { runtime: runtime("failed") }),
        child("deleted", { deletedAt: "2026-10-23" }),
      ]),
    ).toEqual([]);
  });
  it("retains a running archived child and treats missing parents as standalone roots", () => {
    const c = child("orphan", { archivedAt: "2026-10-22" });
    expect(collectActiveWork([c])[0]!.root).toEqual(c);
  });
  it("does not attach a remote child to a local parent with the same id", () => {
    const c = child("remote", { environmentId: EnvironmentId.make("remote") });
    expect(collectActiveWork([root, c])[0]!.root.id).toBe(c.id);
  });
  it("preserves row order when incoming updates and input array order change", () => {
    const a = child("a"),
      b = child("b");
    expect(collectActiveWork([root, b, a])[0]!.children.map((t) => t.id)).toEqual([a.id, b.id]);
    expect(
      collectActiveWork([{ ...a, updatedAt: "2099-01-01" }, root, b])[0]!.children.map((t) => t.id),
    ).toEqual([a.id, b.id]);
  });
  it("does not loop on cyclic parent metadata", () => {
    const a = child("a", {
      lineage: {
        ...root.lineage,
        parentThreadId: ThreadId.make("b"),
        relationshipToParent: "subagent",
      },
    });
    const b = child("b", { lineage: { ...a.lineage, parentThreadId: a.id } });
    expect(collectActiveWork([a, b])).toHaveLength(2);
  });
});
