import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, RunId } from "@t3tools/contracts";
import {
  inboxReason,
  inboxThreadKey,
  resumableThreads,
  resumeVisits,
  type InboxThread,
} from "./workbenchInbox";
const thread = (patch: Partial<InboxThread> = {}): InboxThread => ({
  environmentId: EnvironmentId.make("local"),
  id: ThreadId.make("one"),
  archivedAt: null,
  deletedAt: null,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  latestRun: null,
  runtime: null,
  settledAt: null,
  pendingBackgroundTasks: [],
  lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: ThreadId.make("one") },
  ...patch,
});
const run = (status: "completed" | "failed", id = "run") => ({
  runId: RunId.make(id),
  status,
  requestedAt: null,
  startedAt: null,
  completedAt: "2026-10-06T10:00:00Z",
  assistantMessageId: null,
});
describe("workbench attention and resume", () => {
  it("keeps background reviews and monitors out of new results", () => {
    const completed = thread({
      latestRun: run("completed"),
      lastVisitedAt: "2026-10-05",
      pendingBackgroundTasks: [{ taskId: "watch", kind: "monitor" }],
    });
    expect(inboxReason(completed)).toBeNull();
    expect(
      inboxReason({ ...completed, pendingBackgroundTasks: [{ taskId: "dev", kind: "command" }] }),
    ).toBe("有新结果");
  });
  it("bootstraps resume history without letting mark-unread erase newer visits", () => {
    const item = thread({ lastVisitedAt: "2026-10-05" });
    const key = inboxThreadKey(item);
    expect(resumeVisits([item], {}, {})).toEqual({ [key]: "2026-10-05" });
    expect(resumeVisits([item], { [key]: "2026-10-06" }, {})).toEqual({ [key]: "2026-10-06" });
  });
  it("keeps child and archived pending requests visible after reading", () => {
    expect(
      inboxReason(
        thread({
          hasPendingApprovals: true,
          archivedAt: "2026-10-05",
          lastVisitedAt: "2026-10-07",
          lineage: {
            parentThreadId: ThreadId.make("parent"),
            relationshipToParent: "subagent",
            rootThreadId: ThreadId.make("parent"),
          },
        }),
      ),
    ).toBe("待授权");
    expect(inboxReason(thread({ hasPendingUserInput: true, lastVisitedAt: "2026-10-07" }))).toBe(
      "待回答",
    );
  });
  it("does not guess waiting from an idle run or import unseen history", () => {
    expect(inboxReason(thread())).toBeNull();
    expect(inboxReason(thread({ latestRun: run("completed"), lastVisitedAt: null }))).toBeNull();
  });
  it("uses authoritative server visits and separates failed runs from results", () => {
    expect(
      inboxReason(
        thread({ latestRun: run("completed"), lastVisitedAt: "2026-10-06T09:00:00Z" }),
        "2026-10-07",
      ),
    ).toBe("有新结果");
    expect(inboxReason(thread({ latestRun: run("failed"), lastVisitedAt: "2026-10-07" }))).toBe(
      "运行失败",
    );
    expect(inboxReason(thread({ latestRun: run("failed"), settledAt: "2026-10-07" }))).toBeNull();
  });
  it("does not carry a failed result into a replacement active run", () => {
    expect(
      inboxReason(
        thread({
          latestRun: run("failed"),
          runtime: {
            status: "running",
            activeRunId: RunId.make("new"),
            providerInstanceId: "codex" as NonNullable<
              InboxThread["runtime"]
            >["providerInstanceId"],
            providerName: null,
            lastError: null,
            updatedAt: "2026-10-07",
          },
        }),
      ),
    ).toBeNull();
  });
  it("isolates identical thread ids by environment and retains visited read tasks", () => {
    const a = thread();
    const b = thread({ environmentId: EnvironmentId.make("remote") });
    const visits = { [inboxThreadKey(a)]: "2026-10-06" };
    expect(resumableThreads([a, b], visits, {})).toEqual([a]);
    expect(resumableThreads([a, b], visits, { [inboxThreadKey(b)]: "2026-10-05" })).toEqual([b, a]);
  });
  it("filters actual subagents only from recent, allows explicit child bookmarks", () => {
    const child = thread({
      lineage: {
        parentThreadId: ThreadId.make("parent"),
        relationshipToParent: "subagent",
        rootThreadId: ThreadId.make("parent"),
      },
    });
    const visits = { [inboxThreadKey(child)]: "2026-10-06" };
    expect(resumableThreads([child], visits, {})).toEqual([]);
    expect(resumableThreads([child], visits, visits)).toEqual([child]);
  });
});
