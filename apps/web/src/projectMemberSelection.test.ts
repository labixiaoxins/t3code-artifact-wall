import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  compactWorkspacePath,
  defaultProjectMember,
  isDatedCodexWorkspace,
  projectMemberMenu,
  recentProjectMembers,
} from "./projectMemberSelection";
const local = EnvironmentId.make("local"),
  remote = EnvironmentId.make("remote");
const member = (id: string, path: string, environmentId = local) => ({
  id: ProjectId.make(id),
  environmentId,
  physicalProjectKey: `${environmentId}:${id}`,
  title: id,
  workspaceRoot: path,
  environmentLabel: environmentId === local ? "本机" : "远程",
});
const a = member("a", "/Users/fiction/Projects/a"),
  b = member("b", "/Users/fiction/Projects/b"),
  old = member("old", "/Users/fiction/Documents/Codex/2026-09-24/old");
const usage = (m: typeof a, at: string) => ({
  projectId: m.id,
  environmentId: m.environmentId,
  latestUserMessageAt: at,
});
describe("one-click category member", () => {
  it("uses valid saved choice ahead of newer messages, ignoring stale preferences", () => {
    const messages = [usage(b, "2026-10-06")];
    expect(defaultProjectMember([a, b, old], messages, a.physicalProjectKey)).toBe(a);
    expect(defaultProjectMember([a, b, old], messages, "gone")).toBe(b);
  });
  it("falls back to most recent user message, then first non-date, then first member", () => {
    expect(
      defaultProjectMember([a, b, old], [usage(a, "2026-10-01"), usage(old, "2026-10-06")], null),
    ).toBe(old);
    expect(defaultProjectMember([old, b, a], [usage(old, "invalid")], null)).toBe(b);
    expect(defaultProjectMember([old], [], null)).toBe(old);
    expect(defaultProjectMember([], [], null)).toBeUndefined();
  });
  it("does not mix same project IDs on different environments or use thread update time", () => {
    const other = member("a", "/home/fiction/Projects/a", remote);
    expect(defaultProjectMember([a, other, b], [usage(other, "2026-10-06")], null)).toBe(other);
    const updatedOnly = { ...usage(a, "invalid"), updatedAt: "2027-01-01" };
    expect(recentProjectMembers([a, b], [updatedOnly, usage(b, "2026-10-06")])).toEqual([b, a]);
  });
  it("compacts only home roots and classifies the exact dated Codex directory", () => {
    expect(compactWorkspacePath(a.workspaceRoot)).toBe("~/Projects/a");
    expect(compactWorkspacePath("/Volumes/Users/fiction/a")).toBe("/Volumes/Users/fiction/a");
    expect(isDatedCodexWorkspace(old.workspaceRoot)).toBe(true);
    expect(isDatedCodexWorkspace("~/Documents/Codex/2026-10-06/old")).toBe(true);
    expect(isDatedCodexWorkspace("/Users/fiction/Documents/Codex/notes/2026-10-06")).toBe(false);
  });
  it("orders by actual use, moves historical entries to submenu and hides single-environment names", () => {
    const items = projectMemberMenu(
      [a, old, b],
      [usage(b, "2026-10-05"), usage(old, "2026-10-06")],
    );
    expect(items.map((item) => item.id)).toEqual([
      b.physicalProjectKey,
      a.physicalProjectKey,
      "historical-members",
    ]);
    expect(items[0]?.label).toBe("b — ~/Projects/b");
    expect(items[2]).toMatchObject({
      label: "更早的历史目录（1）",
      children: [{ id: old.physicalProjectKey }],
      separatorBefore: true,
    });
    expect(
      projectMemberMenu([a, member("remote", "/home/fiction/work", remote)], [])[0]?.label,
    ).toContain("本机");
  });
});
