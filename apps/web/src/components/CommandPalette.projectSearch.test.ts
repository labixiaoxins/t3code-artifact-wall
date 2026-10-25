import { pinyin } from "pinyin-pro";
import { describe, expect, it } from "vite-plus/test";

import {
  createProjectPinyinConverter,
  lastPathSegment,
  rankProjectSearchItems,
  type ProjectSearchCandidate,
} from "./CommandPalette.projectSearch";
import { filterCommandPaletteGroups, type CommandPaletteActionItem } from "./CommandPalette.logic";

const toPinyin = createProjectPinyinConverter(pinyin);

function candidate(
  name: string,
  overrides: Partial<ProjectSearchCandidate<string>> = {},
): ProjectSearchCandidate<string> {
  return {
    item: name,
    title: name,
    displayName: name,
    workspaceRoot: `/Users/me/code/${name.replaceAll(" ", "-")}`,
    recency: 0,
    ...overrides,
  };
}

function rank(candidates: ProjectSearchCandidate<string>[], query: string, limit?: number) {
  return rankProjectSearchItems({ candidates, query, toPinyin, ...(limit ? { limit } : {}) });
}

describe("rankProjectSearchItems", () => {
  const projects = [
    candidate("批量设计工具"),
    candidate("拼图设计"),
    candidate("Design System"),
    candidate("Redesign"),
  ];

  it("matches Chinese titles by pinyin initials", () => {
    expect(rank(projects, "plsj")).toEqual(["批量设计工具"]);
  });

  it("matches Chinese titles by full pinyin and pinyin prefix", () => {
    expect(rank(projects, "piliang")).toEqual(["批量设计工具"]);
    expect(rank(projects, "pl")).toEqual(["批量设计工具"]);
  });

  it("matches the last workspace folder name", () => {
    const [project] = [candidate("Untitled", { workspaceRoot: "/Users/me/code/my-app/" })];
    expect(rank([project!], "my-app")).toEqual(["Untitled"]);
  });

  it("ranks word-start and prefix above pinyin above mid-word", () => {
    // "sj": 设计 -> sj via pinyin initials; "Redesign" only contains "sign".
    expect(rank(projects, "design")).toEqual(["Design System", "Redesign"]);
    const mixed = [candidate("Xsjx"), candidate("设计"), candidate("sj-tool")];
    expect(rank(mixed, "sj")).toEqual(["sj-tool", "设计", "Xsjx"]);
  });

  it("breaks ties within a tier by latest activity", () => {
    const older = candidate("Docs Old", { recency: 1 });
    const newer = candidate("Docs New", { recency: 2 });
    expect(rank([older, newer], "docs")).toEqual(["Docs New", "Docs Old"]);
  });

  it("returns at most five projects", () => {
    const many = Array.from({ length: 9 }, (_, index) => candidate(`app-${index}`));
    expect(rank(many, "app")).toHaveLength(5);
  });

  it("still ranks without a pinyin converter loaded", () => {
    expect(rankProjectSearchItems({ candidates: projects, query: "plsj", toPinyin: null })).toEqual(
      [],
    );
    expect(rankProjectSearchItems({ candidates: projects, query: "设计", toPinyin: null })).toEqual(
      ["批量设计工具", "拼图设计"],
    );
  });

  it("extracts the last path segment", () => {
    expect(lastPathSegment("/a/b/c/")).toBe("c");
    expect(lastPathSegment("C:\\a\\b")).toBe("b");
  });
});

function threadItem(id: string, title: string, contentSnippet?: string): CommandPaletteActionItem {
  return {
    kind: "action",
    value: `thread:${id}`,
    searchTerms: [title, contentSnippet ?? "", id],
    title,
    icon: null,
    ...(contentSnippet
      ? { threadContentMatch: { source: "user" as const, snippet: contentSnippet, query: "auth" } }
      : {}),
    run: async () => undefined,
  };
}

describe("filterCommandPaletteGroups project group", () => {
  it("puts projects first and message-only thread matches last", () => {
    const projectItem: CommandPaletteActionItem = {
      kind: "action",
      value: "project:a",
      searchTerms: ["auth service"],
      title: "auth service",
      icon: null,
      run: async () => undefined,
    };
    const groups = filterCommandPaletteGroups({
      activeGroups: [
        {
          value: "actions",
          label: "Actions",
          items: [{ ...projectItem, value: "action:auth", searchTerms: ["auth settings"] }],
        },
      ],
      query: "auth",
      isInSubmenu: false,
      projectSearchItems: [projectItem],
      topProjectItems: [projectItem],
      threadSearchItems: [
        threadItem("body", "Refactor login", "please fix the auth flow"),
        threadItem("title", "Auth bug"),
      ],
    });
    expect(groups.map((group) => group.value)).toEqual([
      "projects-top",
      "actions",
      "threads-search",
      "thread-messages-search",
    ]);
    expect(groups[2]?.items.map((item) => item.value)).toEqual(["thread:title"]);
    expect(groups[3]?.items.map((item) => item.value)).toEqual(["thread:body"]);
  });
});
