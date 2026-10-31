import { describe, expect, it } from "@effect/vitest";
import { uiText } from ".";
import { approvalOptionLabel } from "./approval";

describe("approval option localization", () => {
  it("distinguishes one-time, session, thread and persistent authorization", () => {
    expect(approvalOptionLabel("Allow once", "zh-CN")).toBe("仅允许本次");
    expect(approvalOptionLabel("Allow for this session", "zh-CN")).toBe("本次会话始终允许");
    expect(approvalOptionLabel("Allow for this thread", "zh-CN")).toBe("此任务内始终允许");
    expect(approvalOptionLabel("Always allow", "zh-CN")).toBe("始终允许");
    expect(approvalOptionLabel("Allow all edits this session", "zh-CN")).toBe(
      "本次会话允许所有编辑",
    );
  });

  it("keeps application names, commands and permission targets unchanged in known templates", () => {
    const target = "Safari / 用户项目 $HOME {target} <script>";
    expect(approvalOptionLabel(`Always allow ${target}`, "zh-CN")).toBe(`始终允许 ${target}`);
    expect(approvalOptionLabel("Allow every bash request this session", "zh-CN")).toBe(
      "本次会话允许所有 bash 请求",
    );
    expect(approvalOptionLabel("Allow git status, /tmp/* this session", "zh-CN")).toBe(
      "本次会话始终允许 git status, /tmp/*",
    );
  });

  it("preserves unfamiliar provider options and English labels verbatim", () => {
    const unknown = "Approve only if the account is unchanged";
    expect(approvalOptionLabel(unknown, "zh-CN")).toBe(unknown);
    expect(approvalOptionLabel("Always allow Safari\nExtra scope", "zh-CN")).toBe(
      "Always allow Safari\nExtra scope",
    );
    for (const label of [
      "Allow once",
      "Always allow Safari",
      "Allow every bash request this session",
    ]) {
      expect(approvalOptionLabel(label, "en")).toBe(label);
    }
  });

  it("explains future authorization and repeated execution without weakening the warning", () => {
    expect(uiText("Applies to future requests", undefined, "zh-CN")).toBe("也适用于今后的请求");
    expect(
      uiText("Untrusted files could re-run this action without asking.", undefined, "zh-CN"),
    ).toBe("不受信任的文件可能再次触发此操作，且不会再征求你的授权。");
    const unknown = "Other permissions may persist on the host.";
    expect(uiText(unknown, undefined, "zh-CN")).toBe(unknown);
  });
});
