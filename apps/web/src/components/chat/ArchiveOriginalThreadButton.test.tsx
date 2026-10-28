import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { AsyncResult } from "effect/reactivity";
import * as Cause from "effect/Cause";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
const test = vi.hoisted(() => ({
  permitted: true,
  supported: true,
  archive: vi.fn(),
  unarchive: vi.fn(),
  refresh: vi.fn(),
  notice: vi.fn(),
  finish: vi.fn(),
  invalidate: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({ environment: { capabilities: { threadArchiveSafety: test.supported } } }),
}));
vi.mock("../../state/server", () => ({ serverEnvironment: { configValueAtom: () => "config" } }));
vi.mock("../../state/session", () => ({ useEnvironmentScope: () => test.permitted }));
vi.mock("../../state/threads", () => ({
  threadEnvironment: { archive: "archive", unarchive: "unarchive" },
}));
vi.mock("../../state/use-orchestration-command", () => ({
  useOrchestrationCommand: (command: string) =>
    command === "archive" ? test.archive : test.unarchive,
}));
vi.mock("../../lib/archivedThreadsState", () => ({
  refreshArchivedThreadsForEnvironment: (...args: unknown[]) => test.refresh(...args),
}));
vi.mock("../../hooks/threadUndo", () => ({
  begin: () => ({ finish: test.finish, isCurrent: () => true }),
  invalidate: (...args: unknown[]) => test.invalidate(...args),
}));
vi.mock("../../hooks/showThreadUndoNotice", () => ({
  showThreadUndoNotice: (...args: unknown[]) => test.notice(...args),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => test.navigate }));
vi.mock("../ui/button", () => ({ Button: (props: object) => <button {...props} /> }));
import { ArchiveOriginalThreadButton } from "./ArchiveOriginalThreadButton";
const environmentId = "fixture" as EnvironmentId;
const threadId = "original" as ThreadId;
let view: ReactTestRenderer;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  test.permitted = true;
  test.supported = true;
  test.archive.mockResolvedValue(AsyncResult.success(undefined));
  test.unarchive.mockResolvedValue(AsyncResult.success(undefined));
});
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  vi.unstubAllGlobals();
});
const mount = async (disconnected = false) => {
  await act(async () => {
    view = create(
      <ArchiveOriginalThreadButton
        environmentId={environmentId}
        threadId={threadId}
        disconnected={disconnected}
      />,
    );
  });
};
it("archives exactly one original with server safety enabled, and reuses Undo without navigation", async () => {
  await mount();
  await act(async () => view.root.findByType("button").props.onClick());
  expect(test.archive).toHaveBeenCalledExactlyOnceWith({
    environmentId,
    input: { threadId, requireIdle: true },
  });
  expect(test.notice).toHaveBeenCalledOnce();
  await act(async () => test.notice.mock.calls[0]![0].undo());
  expect(test.unarchive).toHaveBeenCalledExactlyOnceWith({ environmentId, input: { threadId } });
  expect(test.refresh).toHaveBeenCalledTimes(2);
  expect(test.navigate).not.toHaveBeenCalled();
});
it("preserves the rejected thread and provides schedule management without changing schedules", async () => {
  test.archive.mockResolvedValue(
    AsyncResult.failure(Cause.fail(new Error("原会话绑定了已启用的定时任务"))),
  );
  await mount();
  await act(async () => view.root.findByType("button").props.onClick());
  expect(test.notice).not.toHaveBeenCalled();
  expect(test.unarchive).not.toHaveBeenCalled();
  expect(JSON.stringify(view.toJSON())).toContain("已启用的定时任务");
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((b) => b.children.join("") === "管理定时任务")!
      .props.onClick(),
  );
  expect(test.navigate).toHaveBeenCalledWith({
    to: "/settings/scheduled-tasks",
    search: { environmentId },
  });
});
it.each(["permission", "unsupported", "offline"])(
  "blocks unsafe submit when %s",
  async (condition) => {
    test.permitted = condition !== "permission";
    test.supported = condition !== "unsupported";
    await mount(condition === "offline");
    const button = view.root.findByType("button");
    expect(button.props.disabled).toBe(true);
    await act(async () => button.props.onClick());
    expect(test.archive).not.toHaveBeenCalled();
  },
);
it("coalesces repeated clicks until the original request finishes", async () => {
  let finish!: (value: unknown) => void;
  test.archive.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await mount();
  await act(async () => {
    const button = view.root.findByType("button");
    button.props.onClick();
    button.props.onClick();
  });
  expect(test.archive).toHaveBeenCalledOnce();
  await act(async () => finish(AsyncResult.success(undefined)));
});
