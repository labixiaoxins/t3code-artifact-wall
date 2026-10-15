import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as Option from "effect/Option";
import type { EnvironmentId, OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
const test = vi.hoisted(() => ({
  shells: [] as unknown[],
  state: {} as Record<string, unknown>,
  load: vi.fn(async () => undefined),
  quote: vi.fn(() => true),
  navigate: vi.fn(),
  file: vi.fn(),
}));
vi.mock("../../state/entities", () => ({
  useThreadShells: () => test.shells,
  useProjects: () => [],
}));
vi.mock("../../state/threads", () => ({
  useEnvironmentThread: () => test.state,
  threadEnvironment: { loadEarlierHistory: "load" },
}));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => test.load }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => test.navigate }));
vi.mock("../files/projectFilesQueryState", () => ({
  useProjectFileQuery: (...args: unknown[]) => {
    test.file(...args);
    return { data: { contents: "虚构交接内容" } };
  },
}));
vi.mock("../ui/button", () => ({ Button: (props: object) => <button {...props} /> }));
vi.mock("../ui/input", () => ({ Input: (props: object) => <input {...props} /> }));
import { ContinuationHistoryPanel } from "./ContinuationHistoryPanel";
const env = "fictional" as EnvironmentId;
const shell = (id: string, parent: string | null) =>
  ({
    id,
    environmentId: env,
    title: id,
    createdAt: "2026-10-07T00:00:00Z",
    itemCount: 2000,
    worktreePath: "/fictional",
    lineage: { parentThreadId: null, relationshipToParent: null },
    continuedFromThreadId: parent,
    deletedAt: null,
  }) as unknown as EnvironmentThreadShell;
let view: ReactTestRenderer;
const click = async (text: string) => {
  await act(async () =>
    view.root
      .findAllByType("button")
      .find((b) => b.children.join("").trim() === text)!
      .props.onClick(),
  );
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  test.shells = [
    shell("grandparent", null),
    shell("parent", "grandparent"),
    shell("current", "parent"),
    shell("child", "current"),
  ];
  test.state = {
    data: Option.some({
      messages: [],
      visibleTurnItems: [
        { position: 1999, item: { id: "last", type: "assistant_message", text: "末页虚构结果" } },
        { position: 1998, item: { id: "tool", type: "command_execution", text: "hidden tool" } },
      ],
    }),
    error: Option.none(),
    history: { hasMoreHistory: true, loading: false, error: null },
  };
});
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  vi.unstubAllGlobals();
});
const mount = async () => {
  await act(async () => {
    view = create(
      <ContinuationHistoryPanel
        environmentId={env}
        thread={shell("current", "parent")}
        projection={
          {
            messages: [
              { role: "user", text: "。先完整读取 /fictional/HANDOFF.md，按其中未完成事项继续；" },
            ],
          } as unknown as OrchestrationV2ThreadProjection
        }
        onQuote={test.quote}
      />,
    );
  });
};
describe("continuation panel interactions", () => {
  it("shows only the direct parent and child, and loads the next page on request", async () => {
    await mount();
    expect(JSON.stringify(view.toJSON())).toContain("parent");
    expect(JSON.stringify(view.toJSON())).not.toContain("grandparent");
    await click("查看记录");
    expect(JSON.stringify(view.toJSON())).toContain("末页虚构结果");
    expect(JSON.stringify(view.toJSON())).not.toContain("hidden tool");
    await click("继续加载更早记录");
    expect(test.load).toHaveBeenCalledExactlyOnceWith({
      environmentId: env,
      input: { threadId: "parent" },
    });
    expect(test.navigate).not.toHaveBeenCalled();
  });
  it("filters loaded messages, quotes without navigation/send, and opens the handoff read-only", async () => {
    await mount();
    await click("查看记录");
    await act(async () =>
      view.root.findByType("input").props.onChange({ target: { value: "不存在" } }),
    );
    expect(JSON.stringify(view.toJSON())).toContain("没有匹配消息");
    await act(async () =>
      view.root.findByType("input").props.onChange({ target: { value: "末页" } }),
    );
    await click("引用");
    expect(test.quote).toHaveBeenCalledExactlyOnceWith(
      "\n\n> 末页虚构结果\n\n— 原会话《parent》（threadId: parent · 条目 last）\n\n",
    );
    expect(test.navigate).not.toHaveBeenCalled();
    await click("打开交接文件");
    expect(test.file).toHaveBeenLastCalledWith(env, "/fictional", "/fictional/HANDOFF.md", true);
    expect(JSON.stringify(view.toJSON())).toContain("虚构交接内容");
  });
});
