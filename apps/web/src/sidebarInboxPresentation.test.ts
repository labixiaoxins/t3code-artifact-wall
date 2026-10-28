import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId, RunId } from "@t3tools/contracts";
import { inboxThreadKey, type InboxThread } from "./workbenchInbox";
import {
  nextAttentionThread,
  attentionPage,
  sortedAttentionThreads,
  sidebarPreviewThreads,
  groupAttentionCounts,
  sidebarRelativeTime,
} from "./sidebarInboxPresentation";
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

const item = (
  id: string,
  patch: Partial<InboxThread> = {},
  updatedAt = "2026-10-06T10:00:00Z",
) => ({ ...thread(patch), id: ThreadId.make(id), updatedAt });
describe("sidebar inbox presentation", () => {
  it("starts at the first sorted attention item, advances and wraps across the full list", () => {
    const rows = sortedAttentionThreads(
      [
        item("failure", { latestRun: run("failed") }),
        ...Array.from({ length: 6 }, (_, i) =>
          item(`request-${i}`, { hasPendingApprovals: true }, `2026-10-06T0${i}:00:00Z`),
        ),
      ],
      {},
    );
    expect(nextAttentionThread(rows, null)?.id).toBe("request-0");
    expect(nextAttentionThread(rows, inboxThreadKey(item("unlisted")))?.id).toBe("request-0");
    for (let i = 0; i < rows.length; i++) {
      expect(nextAttentionThread(rows, inboxThreadKey(rows[i]!))).toBe(rows[(i + 1) % rows.length]);
    }
    expect(nextAttentionThread([rows[0]!], inboxThreadKey(rows[0]!))).toBe(rows[0]);
    expect(nextAttentionThread([], null)).toBeNull();
  });
  it("sorts by structured request time rather than an older run's start", () => {
    const olderRunNewRequest = {
      ...item("new-request", {
        hasPendingApprovals: true,
        latestRun: { ...run("completed"), requestedAt: "2026-10-06T06:00:00Z" },
      }),
      pendingRequestCreatedAt: "2026-10-06T09:00:00Z",
    };
    const newerRunOldRequest = {
      ...item("old-request", {
        hasPendingUserInput: true,
        latestRun: { ...run("completed"), requestedAt: "2026-10-06T07:00:00Z" },
      }),
      pendingRequestCreatedAt: "2026-10-06T08:00:00Z",
    };
    expect(
      sortedAttentionThreads([olderRunNewRequest, newerRunOldRequest], {}).map((row) => row.id),
    ).toEqual(["old-request", "new-request"]);
  });
  it("orders requests before failures before results and oldest first within each category", () => {
    const rows = [
      item("result", { latestRun: run("completed"), lastVisitedAt: "2026-10-05" }),
      item("error", { latestRun: run("failed") }),
      item("new-request", { hasPendingUserInput: true }, "2026-10-06T09:00:00Z"),
      item("old-request", { hasPendingApprovals: true }, "2026-10-06T08:00:00Z"),
    ];
    expect(sortedAttentionThreads(rows, {}).map((row) => row.id)).toEqual([
      "old-request",
      "new-request",
      "error",
      "result",
    ]);
    expect(
      sortedAttentionThreads(rows, { [inboxThreadKey(rows[1]!)]: "run" }).map((row) => row.id),
    ).not.toContain("error");
  });
  it("defaults to five rows with an accurate expandable remainder", () => {
    const rows = Array.from({ length: 9 }, (_, i) => i);
    expect(attentionPage(rows, false)).toEqual({ rows: [0, 1, 2, 3, 4], hidden: 4 });
    expect(attentionPage(rows, true)).toEqual({ rows, hidden: 0 });
    expect(attentionPage([], false)).toEqual({ rows: [], hidden: 0 });
  });
  it("exempts requests and unknown failures beyond six, plus the open thread, without duplicates", () => {
    const rows = Array.from({ length: 6 }, (_, i) => item(String(i)));
    rows.push(
      item("permission", { hasPendingApprovals: true }),
      item("question", { hasPendingUserInput: true }),
      item("failure", { latestRun: run("failed") }),
      item("result", { latestRun: run("completed"), lastVisitedAt: "2026-10-05" }),
      item("open"),
    );
    expect(
      sidebarPreviewThreads(rows, 6, {}, inboxThreadKey(rows[10]!)).map((row) => row.id),
    ).toEqual(["0", "1", "2", "3", "4", "5", "permission", "question", "failure", "open"]);
    expect(
      sidebarPreviewThreads(rows, 6, { [inboxThreadKey(rows[8]!)]: "run" }, null),
    ).toHaveLength(8);
    expect(sidebarPreviewThreads(rows, 6, {}, inboxThreadKey(rows[0]!))).toHaveLength(9);
  });
  it("counts requests once and only unknown failures, excluding results and deleted threads", () => {
    const rows = [
      item("both", { hasPendingApprovals: true, hasPendingUserInput: true }),
      item("question", { hasPendingUserInput: true }),
      item("failure", { latestRun: run("failed") }),
      item("result", { latestRun: run("completed"), lastVisitedAt: "2026-10-05" }),
      item("deleted", { deletedAt: "2026-10-06", hasPendingApprovals: true }),
    ];
    expect(groupAttentionCounts(rows, {})).toEqual({ requests: 2, errors: 1 });
    expect(groupAttentionCounts(rows, { [inboxThreadKey(rows[2]!)]: "run" })).toEqual({
      requests: 2,
      errors: 0,
    });
    expect(groupAttentionCounts([], {})).toEqual({ requests: 0, errors: 0 });
  });
  it("formats sidebar-only Chinese short relative times", () => {
    const now = Date.parse("2026-10-06T10:00:00Z");
    expect(sidebarRelativeTime("2026-10-06T09:59:50Z", now)).toBe("刚刚");
    expect(sidebarRelativeTime("2026-10-06T09:55:00Z", now)).toBe("5分");
    expect(sidebarRelativeTime("2026-10-06T07:00:00Z", now)).toBe("3时");
    expect(sidebarRelativeTime("2026-10-05T10:00:00Z", now)).toBe("1天");
    expect(sidebarRelativeTime("invalid", now)).toBe("");
  });
});
