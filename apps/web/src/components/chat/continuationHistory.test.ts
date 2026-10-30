import { describe, expect, it } from "vite-plus/test";
import {
  buildContinuationChain,
  continuationHandoffPath,
  continuationMessages,
  continuationQuote,
  neutralizeQuotedTokens,
} from "./continuationHistory";
import type { OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import {
  SKILL_MENTION_PATTERN,
  collectComposerInlineTokens,
} from "@t3tools/shared/composerInlineTokens";

describe("continuation history", () => {
  it("keeps quoted skills, mentions and file links inert", () => {
    const quote = continuationQuote(
      "用 $codex-free-imagegen 出图，看 @src/app.ts 和 [a.ts](/w/a.ts) 再说，预算 $20，邮件 a@b.com",
      "原会话 $title-skill",
      { threadId: "thread-1", itemId: "item-9" },
    );
    expect(collectComposerInlineTokens(`${quote} `)).toEqual([]);
    expect([...quote.matchAll(SKILL_MENTION_PATTERN)]).toEqual([]);
    expect(quote).toContain("`$codex-free-imagegen`");
    // Amounts and e-mail addresses are not tokens, so they stay untouched.
    expect(quote).toContain("预算 $20，邮件 a@b.com");
    expect(quote).toContain("《原会话 `$title-skill`》");
    expect(quote).toContain("threadId: thread-1 · 条目 item-9");
  });
  it("leaves fenced and inline code byte-for-byte unchanged", () => {
    const text = "运行 `echo $HOME` 然后：\n```bash\nexport A=$PATH @x\n```\n再用 $skill-x";
    expect(neutralizeQuotedTokens(text)).toBe(
      "运行 `echo $HOME` 然后：\n```bash\nexport A=$PATH @x\n```\n再用 `$skill-x`",
    );
  });
  it("quotes multiline messages, neutralizes title newlines, and caps Unicode characters", () => {
    expect(continuationQuote("第一行\n第二行", "标题\n下一行")).toBe(
      "\n\n> 第一行\n> 第二行\n\n来源：原会话《标题 下一行》\n\n",
    );
    const quote = continuationQuote("🧪".repeat(1501), "虚构标题");
    expect(Array.from(quote.match(/> (.+)/u)![1]!)).toHaveLength(1500);
    expect(quote).toContain("[已截断]");
    expect(continuationQuote("a".repeat(1500), "标题")).not.toContain("已截断");
  });
  it("reads the generated first prompt, supports spaces, and falls back to the source's last assistant", () => {
    expect(
      continuationHandoffPath(
        "接手旧会话《测试》。先完整读取 /work/with spaces/HANDOFF.md，按其中未完成事项继续；已验证的部分不要重做。",
        "HANDOFF: /older.md",
      ),
    ).toBe("/work/with spaces/HANDOFF.md");
    expect(continuationHandoffPath(undefined, "已完成\nHANDOFF: /last.md")).toBe("/last.md");
    expect(continuationHandoffPath("随便的 /file.md", "无交接")).toBeNull();
    expect(
      continuationHandoffPath("。先完整读取 ../relative.md，按其中未完成事项继续；", undefined),
    ).toBeNull();
  });
  it("filters tools, searches loaded pages without case sensitivity, and keeps chronology", () => {
    const rows = [
      { position: 3, item: { type: "assistant_message", text: "older NEEDLE", id: "a" } },
      { position: 2, item: { type: "command_execution", text: "needle", id: "tool" } },
      { position: 1, item: { type: "user_message", text: "first needle", id: "u" } },
      { position: 4, item: { type: "assistant_message", text: "no match", id: "b" } },
    ] as unknown as OrchestrationV2ProjectedTurnItem[];
    expect(continuationMessages(rows, " Needle ").map((r) => r.item.id)).toEqual(["u", "a"]);
    expect(continuationMessages(rows, "").map((r) => r.item.id)).toEqual(["u", "a", "b"]);
  });
});

describe("continuation lineage", () => {
  const segment = (id: string, parent: string | null) => ({
    id,
    continuedFromThreadId: parent,
    lineage: { relationshipToParent: null as string | null },
    forkedFrom: null as object | null,
    deletedAt: null as string | null,
  });
  it("walks all generations in oldest-first order and ignores unrelated siblings", () => {
    const current = segment("c", "b");
    const result = buildContinuationChain(current, [
      segment("a", null),
      segment("b", "a"),
      segment("sibling", "a"),
    ]);
    expect(result.segments.map((thread) => thread.id)).toEqual(["a", "b", "c"]);
    expect(result.issue).toBeNull();
  });
  it("stops cycles without duplicating segments", () => {
    const current = segment("b", "a");
    const result = buildContinuationChain(current, [segment("a", "b"), current]);
    expect(result.issue).toBe("cycle");
    expect(result.segments.map((thread) => thread.id)).toEqual(["a", "b"]);
  });
  it.each([
    { ...segment("a", null), lineage: { relationshipToParent: "subagent" } },
    { ...segment("a", null), forkedFrom: { threadId: "fork" } },
    { ...segment("a", null), deletedAt: "2026-10-19" },
  ])("never assigns continuation positions to a fork, subagent or deleted segment", (invalid) => {
    const result = buildContinuationChain(segment("b", "a"), [invalid]);
    expect(result.issue).toBe("broken");
    expect(result.segments.map((thread) => thread.id)).toEqual(["b"]);
  });
  it("reports missing links without claiming the source was deleted", () => {
    expect(buildContinuationChain(segment("c", "missing"), []).missingId).toBe("missing");
  });
});
