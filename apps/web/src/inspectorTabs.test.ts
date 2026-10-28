import { describe, expect, it } from "vite-plus/test";
import { parseInspectorTab, resolveInspectorTab } from "./inspectorTabs";

describe("inspector tab preference", () => {
  it("only accepts known tabs", () => {
    expect(parseInspectorTab("history")).toBe("history");
    expect(parseInspectorTab("diff")).toBeNull();
    expect(parseInspectorTab(null)).toBeNull();
  });
  it("restores the remembered tab when the thread has it, else the first available", () => {
    expect(resolveInspectorTab("history", ["artifacts", "history", "project"])).toBe("history");
    expect(resolveInspectorTab("history", ["project"])).toBe("project");
    expect(resolveInspectorTab(null, ["artifacts", "project"])).toBe("artifacts");
  });
});
