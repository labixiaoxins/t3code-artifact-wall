import { describe, expect, it } from "vite-plus/test";
import { ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import {
  buildHandoffInstruction,
  contextRatio,
  expectedHandoffPath,
  continuationParameters,
  longConversationLevel,
  parseHandoffPath,
} from "./contextHandoff";

const normal = {
  enabled: true,
  dismissed: false,
  relationshipToParent: null,
  items: 0,
  turns: 0,
  ratio: null,
};
describe("long conversation thresholds", () => {
  it.each([
    [{ items: 799, turns: 29, ratio: 0.599 }, null],
    [{ items: 800 }, "reminder"],
    [{ turns: 30 }, "reminder"],
    [{ ratio: 0.6 }, "reminder"],
    [{ items: 1500 }, "strong"],
    [{ turns: 50 }, "strong"],
    [{ ratio: 0.8 }, "strong"],
    [{ items: 1499, turns: 49, ratio: 0.799 }, "reminder"],
    [{ usedTokens: 150_000 }, "reminder"],
    [{ usedTokens: 250_000 }, "strong"],
    [{ usedTokens: 149_999, ratio: 0.15 }, null],
    [{ items: 9999, enabled: false }, null],
    [{ items: 9999, dismissed: true }, "strong"],
    [{ turns: 30, dismissed: true }, null],
    [{ usedTokens: 150_000, ratio: 0.15 }, null],
    [{ usedTokens: 250_000, ratio: 0.25 }, null],
    [{ ratio: 0.95, dismissed: true }, "strong"],
    [{ ratio: 0.95, enabled: false }, "strong"],
    [{ ratio: 0.05, turns: 30 }, "reminder"],
    [{ items: 9999, relationshipToParent: "subagent" }, null],
    [{ turns: 30, relationshipToParent: "fork" }, "reminder"],
  ])("classifies %j", (change, expected) =>
    expect(longConversationLevel({ ...normal, ...change })).toBe(expected),
  );
  it("uses a reported denominator only", () => {
    expect(contextRatio({ usedTokens: 600, maxTokens: 1000 })).toBe(0.6);
    expect(contextRatio({ usedTokens: 600 })).toBeNull();
    expect(contextRatio({ usedTokens: 600, maxTokens: 0 })).toBeNull();
    expect(contextRatio({ usedTokens: NaN, maxTokens: 1000 })).toBeNull();
  });
});
describe("handoff line", () => {
  it.each([
    ["Done\nHANDOFF: /tmp/a.md", "/tmp/a.md"],
    ["证据\r\nHANDOFF: /tmp/my project/交接.md\r\n\n", "/tmp/my project/交接.md"],
    ["no handoff", null],
    ["HANDOFF: relative.md", null],
    ["quoted HANDOFF: /tmp/a.md", null],
    // Decorations real models add around the path.
    ["HANDOFF: `/tmp/a.md`", "/tmp/a.md"],
    ["**HANDOFF:** /tmp/a.md", "/tmp/a.md"],
    ["**HANDOFF: /tmp/a.md**", "/tmp/a.md"],
    ["HANDOFF: </tmp/a.md>", "/tmp/a.md"],
    ["HANDOFF：/tmp/a.md。", "/tmp/a.md"],
    ["`HANDOFF: /tmp/a.md`", "/tmp/a.md"],
    ["- HANDOFF: /tmp/a.md", "/tmp/a.md"],
    // A short sign-off after the line is tolerated; the file must still exist to be used.
    ["HANDOFF: /tmp/a.md\n已停止。", "/tmp/a.md"],
    ["HANDOFF: /tmp/a.md\n1\n2\n3\n4\n5", null],
    // A note after the file name must not become part of the path.
    ["HANDOFF: /tmp/a.md （已写好）", "/tmp/a.md"],
    ["HANDOFF: `/tmp/my dir/a.md`（已写好）", "/tmp/my dir/a.md"],
    ["HANDOFF: /tmp/a.md (done)", "/tmp/a.md"],
  ])("parses %j", (text, path) => expect(parseHandoffPath(text)).toBe(path));
  it.each([
    ["Done\nHANDOFF: /tmp/a.md", "/tmp/a.md"],
    ["- HANDOFF: /tmp/a.md", null],
    ["handoff: /tmp/a.md", null],
    ["HANDOFF: /tmp/a.md\n已停止。", null],
    ["**HANDOFF:** /tmp/a.md", null],
  ])("strict mode (no request) parses %j", (text, path) =>
    expect(parseHandoffPath(text, { strict: true })).toBe(path),
  );
  it("names the exact dated file in the instruction and asks to stop", () => {
    const path = expectedHandoffPath("/work/demo/", "123456789abc", new Date(2026, 9, 7));
    expect(path).toBe("/work/demo/HANDOFF-12345678-20261007.md");
    const prompt = buildHandoffInstruction(path);
    expect(prompt).toContain(`HANDOFF: ${path}`);
    expect(prompt).not.toContain("<");
    expect(prompt).toContain("回滚");
    expect(prompt).toContain("停止");
    expect(prompt).not.toContain("委派子任务");
  });
  it("asks for unfinished delegated work to be listed", () => {
    expect(buildHandoffInstruction("/w/HANDOFF-x.md", 2)).toContain("2 个委派子任务");
  });
});
describe("continuation parameters", () => {
  const source = {
    id: ThreadId.make("old-thread"),
    projectId: ProjectId.make("project"),
    title: "虚构项目",
    modelSelection: {
      instanceId: ProviderInstanceId.make("custom-codex"),
      model: "gpt-6.1-sol",
      options: [{ id: "reasoningEffort", value: "high" }],
    },
    runtimeMode: "auto-accept-edits" as const,
    interactionMode: "plan" as const,
    branch: "local/demo",
    worktreePath: "/tmp/demo-worktree",
  };
  it("inherits project, checkout, model options and both modes without provider history", () => {
    const result = continuationParameters(
      source,
      ThreadId.make("new-thread"),
      "/tmp/demo worktree/HANDOFF.md",
    );
    expect(result.create).toEqual({
      projectId: source.projectId,
      modelSelection: source.modelSelection,
      runtimeMode: source.runtimeMode,
      interactionMode: source.interactionMode,
      branch: source.branch,
      worktreePath: source.worktreePath,
      threadId: "new-thread",
      continuationOfThreadId: "old-thread",
      title: "虚构项目（续）",
    });
    expect(result.prompt).toBe(
      "接手旧会话《虚构项目》（old-thread）。先完整读取 /tmp/demo worktree/HANDOFF.md，按其中未完成事项继续；已验证的部分不要重做。",
    );
  });
  it("makes missing context explicit", () =>
    expect(continuationParameters(source, ThreadId.make("new"), null).prompt).toContain(
      "不要猜测",
    ));
});
