import { expect, it } from "vite-plus/test";
import { buildSpotlightGroups } from "./CommandPalette.spotlight";
import type { CommandPaletteActionItem } from "./CommandPalette.logic";
const item = (
  value: string,
  extra: Partial<CommandPaletteActionItem> = {},
): CommandPaletteActionItem => ({
  kind: "action",
  value,
  title: value,
  searchTerms: [value],
  icon: null,
  run: async () => {},
  ...extra,
});
it("opens recent work and keeps commands behind a submenu", () => {
  const r = buildSpotlightGroups({
    query: "",
    projectItems: [],
    threadItems: [],
    activeGroups: [
      { value: "actions", label: "Actions", items: [item("new")] },
      { value: "recent-threads", label: "最近会话", items: [item("work")] },
    ],
  });
  expect(r.map((x) => x.value)).toEqual(["recent-threads", "commands"]);
  expect(r[1]?.items[0]?.kind).toBe("submenu");
});
it("keeps approximate matches, orders relevance and collapses related rows", () => {
  const r = buildSpotlightGroups({
    query: "有事就找妈",
    activeGroups: [],
    projectItems: [],
    threadItems: [
      item("old", { searchScore: 500, searchFamilyKey: "f", searchFamilyTitle: "动画制作" }),
      item("child", {
        searchScore: 300,
        searchFamilyKey: "f",
        searchFamilyTitle: "动画制作",
        searchSubagent: true,
      }),
      item("recent unrelated", { searchScore: 1, searchRecency: 999 }),
    ],
  });
  const first = r[0]?.items[0];
  expect(first?.title).toBe("动画制作");
  expect(first?.kind).toBe("submenu");
  if (first?.kind === "submenu")
    expect(first.groups.map((x) => x.items.map((i) => i.value))).toEqual([["old"], ["child"]]);
  expect(r[0]?.items).toHaveLength(2);
});
it("hides unrelated commands and sessions from keyword results", () => {
  expect(
    buildSpotlightGroups({
      query: "杆子",
      activeGroups: [{ value: "actions", label: "操作", items: [item("杆子命令")] }],
      projectItems: [],
      threadItems: [item("无关")],
    }),
  ).toEqual([]);
});
