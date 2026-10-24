import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
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
vi.mock("../../state/threads", () => ({
  threadEnvironment: { create: "create", startTurn: "start", settle: "settle" },
}));
vi.mock("../../state/use-atom-command", () => ({
  useAtomCommand: (name: "create" | "start" | "settle") => test[name],
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => test.navigate }));
vi.mock("../files/projectFilesQueryState", () => ({
  useProjectFileQuery: () => ({ data: null, error: null, isPending: false, refresh: vi.fn() }),
}));
vi.mock("../ui/button", () => ({ Button: (props: object) => <button {...props} /> }));
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
let view: ReactTestRenderer | undefined;
let storage: Map<string, string>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  storage = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  test.shells = [shell];
  for (const command of [test.create, test.start, test.settle])
    command.mockResolvedValue({ _tag: "Success" });
});
afterEach(async () => {
  if (view) await act(async () => view!.unmount());
  view = undefined;
  vi.unstubAllGlobals();
});
const mount = async (projection = fixture(), canCompact = true) => {
  await act(async () => {
    view = create(
      <ContextHandoffNotice
        environmentId={env}
        thread={shell}
        projection={projection}
        cwd="/fictional"
        enabled={false}
        disabled={false}
        onCompact={canCompact ? test.compact : undefined}
      />,
    );
  });
};
const buttons = () =>
  view!.root.findAllByType("button").filter((button) => !button.props["aria-label"]);
const click = async (label: string) => {
  await act(async () => {
    await buttons()
      .find((b) => b.children.join("") === label)!
      .props.onClick();
  });
};
describe("handoff budget recovery", () => {
  it("shows recovery even when long-conversation reminders are disabled, without ordinary retry", async () => {
    await mount();
    expect(buttons().map((b) => b.children.join(""))).toEqual([
      "压缩当前会话",
      "开新会话读取旧记录",
    ]);
    await click("压缩当前会话");
    expect(test.compact).toHaveBeenCalledOnce();
    expect(test.start).not.toHaveBeenCalled();
  });
  it("creates a fresh continuation and sends recovery only there; receipts retain stable IDs", async () => {
    await mount();
    await click("开新会话读取旧记录");
    const created = test.create.mock.calls[0]![0].input;
    const sent = test.start.mock.calls[0]![0].input;
    expect(created.continuationOfThreadId).toBe("old-thread");
    expect(created.threadId).not.toBe("old-thread");
    expect(sent.threadId).toBe(created.threadId);
    expect(sent.commandId).toBe(`context-handoff:start:${created.threadId}`);
    expect(sent.message.text).toContain("nextPosition");
    expect(sent.message.text).toContain("old-thread");
    expect(test.settle).toHaveBeenCalledOnce();
    expect(test.navigate).not.toHaveBeenCalled(); // Wait for the live shell before routing.
  });
  it("reuses the same new thread after a lost first-send response and does not settle old history early", async () => {
    test.start.mockRejectedValueOnce(new Error("connection lost"));
    await mount();
    await click("开新会话读取旧记录");
    expect(test.settle).not.toHaveBeenCalled();
    await click("开新会话读取旧记录");
    expect(test.create.mock.calls[1]![0].input.threadId).toBe(
      test.create.mock.calls[0]![0].input.threadId,
    );
    expect(test.start.mock.calls[1]![0].input.commandId).toBe(
      test.start.mock.calls[0]![0].input.commandId,
    );
    expect(test.settle).toHaveBeenCalledOnce();
  });
  it("keeps fresh-thread recovery available for providers without compaction", async () => {
    await mount(fixture(), false);
    expect(buttons().map((b) => b.children.join(""))).toEqual(["开新会话读取旧记录"]);
  });
  it("does not misclassify rate limits or old failures after successful compaction", async () => {
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
    await mount(compacted);
    expect(view!.toJSON()).toBeNull();
  });
  it("does not infer success from an unrelated run's error", () => {
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
  const projection = {
    ...fixture(),
    runs: [],
    turnItems: [],
    providerTurns: [
      { providerThreadId: "provider", tokenUsage: { usedTokens: 214000, maxTokens: 258000 } },
    ],
  } as unknown as OrchestrationV2ThreadProjection;
  await act(async () => {
    view = create(
      <ContextHandoffNotice
        environmentId={env}
        thread={shell}
        projection={projection}
        cwd="/fictional"
        enabled
        disabled={false}
      />,
    );
  });
  await click("关闭普通提醒");
  expect(buttons().some((button) => button.children.join("") === "恢复普通提醒")).toBe(true);
  expect(test.start).not.toHaveBeenCalled();
  expect(test.create).not.toHaveBeenCalled();
  await click("恢复普通提醒");
  expect(storage.get(`t3-context-handoff:${env}:${shell.id}:dismissed`)).toBe("false");
});
