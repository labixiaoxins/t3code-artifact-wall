import { describe, expect, it } from "@effect/vitest";
import { uiText } from ".";

describe("application UI localization", () => {
  it("translates application copy with an English fallback for missing entries", () => {
    expect(uiText("Settings", undefined, "zh-CN")).toBe("设置");
    expect(uiText("Settings", undefined, "en")).toBe("Settings");
    expect(uiText("Unknown new application label", undefined, "zh-CN")).toBe("Unknown new application label");
  });
  it("keeps user-supplied placeholder values byte-for-byte and does not recursively translate them", () => {
    expect(uiText("untranslated {name}", { name: "Settings / 用户项目 $HOME" }, "zh-CN"))
      .toBe("untranslated Settings / 用户项目 $HOME");
    expect(uiText("untranslated {name}", {}, "zh-CN")).toBe("untranslated {name}");
  });
});
