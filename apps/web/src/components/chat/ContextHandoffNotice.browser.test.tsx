import { describe, expect, it, vi } from "vite-plus/test";
import { render, stubGlobal } from "../../../test/render";
import type { EnvironmentId, OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
const test = vi.hoisted(() => ({
  shells: [] as unknown[],
  create: vi.fn(),
  start: vi.fn(),
  settle: vi.fn(),
  compact: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("../../state/entities", () => ({
  useThreadShell: (ref: { environmentId: string; threadId: string } | null) =>
    ref === null
      ? null
      : ((test.shells as EnvironmentThreadShell[]).find(
          (s) => s.environmentId === ref.environmentId && s.id === ref.threadId,
        ) ?? null),
  useThreadHandoffSummary: (ref: { environmentId: string; threadId: string }) => {
    const shells = (test.shells as EnvironmentThreadShell[]).filter(
      (s) => s.environmentId === ref.environmentId,
    );
    return {
      nextThreadId:
        shells.find((s) => s.continuedFromThreadId === ref.threadId && s.deletedAt === null)?.id ??
        null,
      pendingSubtasks: shells.filter(
        (s) =>
          s.lineage.relationshipToParent === "subagent" &&
          s.lineage.parentThreadId === ref.threadId &&
          s.deletedAt === null &&
          s.archivedAt === null &&
          s.runtime !== null &&
          ["preparing", "starting", "running", "waiting", "queued"].includes(s.runtime.status),
      ).length,
    };
  },
}));
vi.mock("./TurnThroughputStatus", () => ({ LiveTurnThroughput: () => null }));
vi.mock("../../state/threads", () => ({
  threadEnvironment: { create: "create", startTurn: "start", settle: "settle" },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: "create" | "start" | "settle") => test[name],
}));
vi.mock(import("@tanstack/react-router"), async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => test.navigate,
}));
vi.mock("../files/projectFilesQueryState", () => ({
  useProjectFileQuery: () => ({ data: null, error: null, isPending: false, refresh: vi.fn() }),
}));
vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverTrigger: ({
    children,
    render: _render,
    ...props
  }: {
    children: React.ReactNode;
    render: React.ReactNode;
  }) => <button {...props}>{children}</button>,
  PopoverPopup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));
import { ContextHandoffNotice } from "./ContextHandoffNotice";
import { hasHandoffBudgetFailure } from "./contextHandoff";
const env = "fictional" as EnvironmentId;
const shell = {
  id: "old-thread",
  environmentId: env,
  projectId: "fixture-project",
  title: "虚构长会话",
  itemCount: 725,
  activeProviderThreadId: "provider",
  modelSelection: { instanceId: "codex", model: "gpt-6-astra" },
  runtimeMode: "auto",
  interactionMode: "default",
  branch: null,
  worktreePath: "/fictional",
  lineage: { relationshipToParent: null, parentThreadId: null },
  deletedAt: null,
} as unknown as EnvironmentThreadShell;
const failure =
  "Insufficient context allowance for the provider handoff. Compact the target conversation or use a larger-context model; the current request has not been truncated.";
const fixture = (message = failure) =>
  ({
    runs: [{ id: "failed-run", ordinal: 20, status: "failed", userMessageId: "request" }],
    turnItems: [
      { id: "error", runId: "failed-run", type: "error", failure: { code: null, message } },
    ],
    messages: [],
    providerTurns: [],
  }) as unknown as OrchestrationV2ThreadProjection;
function setup() {
  vi.clearAllMocks();
  const storage = new Map<string, string>();
  const local = stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  test.shells = [shell];
  for (const command of [test.create, test.start, test.settle])
    command.mockReset().mockResolvedValue({ _tag: "Success" });
  return { storage, [Symbol.dispose]: () => local[Symbol.dispose]() };
}
const probe = (projection = fixture(), canCompact = true, enabled = false) => (
  <ContextHandoffNotice
    environmentId={env}
    thread={shell}
    projection={projection}
    cwd="/fictional"
    enabled={enabled}
    disabled={false}
    onCompact={canCompact ? test.compact : undefined}
  />
);
describe("handoff budget recovery", () => {
  it("shows recovery even when long-conversation reminders are disabled, without ordinary retry", async () => {
    using _setup = setup();
    await using screen = await render(probe());
    await expect.element(screen.getByRole("button", { name: "开新会话读取旧记录" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "交接到新会话", exact: true }))
      .not.toBeInTheDocument();
    await screen.getByRole("button", { name: "压缩当前会话" }).click();
    expect(test.compact).toHaveBeenCalledOnce();
    expect(test.start).not.toHaveBeenCalled();
  });
  it("creates a fresh continuation and sends recovery only there; receipts retain stable IDs", async () => {
    using _setup = setup();
    await using screen = await render(probe());
    await screen.getByRole("button", { name: "开新会话读取旧记录" }).click();
    await vi.waitFor(() => expect(test.settle).toHaveBeenCalledOnce());
    const created = test.create.mock.calls[0]![0].input;
    const sent = test.start.mock.calls[0]![0].input;
    expect(created.continuationOfThreadId).toBe("old-thread");
    expect(created.threadId).not.toBe("old-thread");
    expect(sent.threadId).toBe(created.threadId);
    expect(sent.commandId).toBe(`context-handoff:start:${created.threadId}`);
    expect(sent.message.text).toContain("nextPosition");
    expect(sent.message.text).toContain("old-thread");
    expect(test.navigate).not.toHaveBeenCalled();
    test.shells.push({ ...shell, id: created.threadId });
    await screen.rerender(probe());
    await vi.waitFor(() =>
      expect(test.navigate).toHaveBeenCalledWith({
        to: "/$environmentId/$threadId",
        params: { environmentId: env, threadId: created.threadId },
      }),
    );
  });
  it("reuses the same new thread after a lost first-send response and does not settle old history early", async () => {
    using _setup = setup();
    test.start.mockRejectedValueOnce(new Error("connection lost"));
    await using screen = await render(probe());
    await screen.getByRole("button", { name: "开新会话读取旧记录" }).click();
    await expect.element(screen.getByText("connection lost")).toBeVisible();
    expect(test.settle).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "开新会话读取旧记录" }).click();
    await vi.waitFor(() => expect(test.settle).toHaveBeenCalledOnce());
    expect(test.create.mock.calls[1]![0].input.threadId).toBe(
      test.create.mock.calls[0]![0].input.threadId,
    );
    expect(test.start.mock.calls[1]![0].input.commandId).toBe(
      test.start.mock.calls[0]![0].input.commandId,
    );
  });
  it("keeps fresh-thread recovery available for providers without compaction", async () => {
    using _setup = setup();
    await using screen = await render(probe(fixture(), false));
    await expect.element(screen.getByRole("button", { name: "开新会话读取旧记录" })).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "压缩当前会话" }))
      .not.toBeInTheDocument();
  });
  it("does not misclassify rate limits or old failures after successful compaction", async () => {
    using _setup = setup();
    expect(hasHandoffBudgetFailure(fixture("Claude API rate limit reached."))).toBe(false);
    const old = fixture();
    const compacted = {
      ...old,
      runs: [
        ...old.runs,
        {
          ...old.runs[0]!,
          id: "compact-run" as (typeof old.runs)[0]["id"],
          ordinal: 21,
          status: "completed" as const,
        },
      ],
    };
    expect(hasHandoffBudgetFailure(compacted)).toBe(false);
    await using screen = await render(probe(compacted));
    expect(screen.container.childElementCount).toBe(0);
  });
  it("does not infer success from an unrelated run's error", () => {
    using _setup = setup();
    const old = fixture();
    expect(
      hasHandoffBudgetFailure({
        ...old,
        runs: [{ ...old.runs[0]!, id: "another" as (typeof old.runs)[0]["id"] }],
      }),
    ).toBe(false);
  });
});

it("keeps context management reachable after dismissing ordinary reminders", async () => {
  using state = setup();
  const projection = {
    ...fixture(),
    runs: [],
    turnItems: [],
    providerTurns: [
      { providerThreadId: "provider", tokenUsage: { usedTokens: 214000, maxTokens: 258000 } },
    ],
  } as unknown as OrchestrationV2ThreadProjection;
  await using screen = await render(probe(projection, false, true));
  await screen.getByRole("button", { name: "关闭普通提醒" }).click();
  await expect.element(screen.getByRole("button", { name: "恢复普通提醒" })).toBeVisible();
  expect(test.start).not.toHaveBeenCalled();
  expect(test.create).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "恢复普通提醒" }).click();
  expect(state.storage.get(`t3-context-handoff:${env}:${shell.id}:dismissed`)).toBe("false");
});
