import { describe, expect, it } from "vite-plus/test";
import {
  summarizeToolGroup,
  type WorkLogPresentationEntry,
} from "@t3tools/client-runtime/work-log/presentation";
import { uiText } from ".";

const entry = (
  id: string,
  fields: Partial<WorkLogPresentationEntry> = {},
): WorkLogPresentationEntry => ({
  id,
  createdAt: "2026-10-30T00:00:00.000Z",
  label: "Tool call",
  tone: "tool",
  toolLifecycleStatus: "completed",
  ...fields,
});

describe("localized work summaries", () => {
  it("translates summary templates while preserving tool names and the default English client", () => {
    const sourceName = "Research and Design, $HOME 工具";
    const entries = [
      entry("source", {
        toolSource: { kind: "integration", key: "custom-source", name: sourceName },
      }),
      entry("command1", { command: "printf unchanged", itemType: "command_execution" }),
      entry("command2", { command: "printf unchanged", itemType: "command_execution" }),
      entry("other"),
    ];
    expect(summarizeToolGroup(entries).summary).toBe(
      `Used ${sourceName} integration, ran 2 commands, and used 1 tool`,
    );
    const translated = summarizeToolGroup(entries, (source, values) =>
      uiText(source, values, "zh-CN"),
    );
    expect(translated.summary).toBe(`使用了 ${sourceName} 集成、执行了 2 条命令、调用了 1 个工具`);
    expect(translated.hasFailure).toBe(false);
    expect(entries[1]!.command).toBe("printf unchanged");
  });

  it("keeps each integration name intact when joining multiple sources", () => {
    const names = ["A and B", "C, D", "E {first}"];
    const entries = names.map((name, index) =>
      entry(String(index), { toolSource: { kind: "integration", key: String(index), name } }),
    );
    expect(
      summarizeToolGroup(entries, (source, values) => uiText(source, values, "zh-CN")).summary,
    ).toBe("使用了 A and B、C, D、E {first} 集成");
  });
});
