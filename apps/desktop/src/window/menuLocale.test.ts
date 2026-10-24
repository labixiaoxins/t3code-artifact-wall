import { describe, expect, it } from "@effect/vitest";
import { localizeApplicationMenu } from "./menuLocale.ts";

describe("desktop menu localization", () => {
  it("retains native role, accelerator and action semantics", () => {
    const click = () => undefined;
    const source = [{ label: "File", submenu: [{ role: "copy" as const }, { label: "Reload", accelerator: "CmdOrCtrl+R", click }] }];
    const translated = localizeApplicationMenu(source, "zh-CN");
    expect(translated[0]?.label).toBe("文件");
    const submenu = translated[0]?.submenu;
    expect(Array.isArray(submenu)).toBe(true);
    if (!Array.isArray(submenu)) throw Error("missing submenu");
    expect(submenu[0]).toEqual({ role: "copy", label: "复制" });
    expect(submenu[1]).toEqual({ label: "重新加载", accelerator: "CmdOrCtrl+R", click });
    expect(source[0]?.label).toBe("File");
    expect(localizeApplicationMenu(source, "en")).toEqual(source);
  });
});
