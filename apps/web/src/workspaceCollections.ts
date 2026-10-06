import type { Project } from "./types";
import { buildProjectGroups, type ProjectGroupingSettings } from "./logicalProject";
import type { EnvironmentId } from "@t3tools/contracts";

export const COLLECTION_ORDER = [
  "项目管理",
  "自媒体",
  "公司管理",
  "交易",
  "AI 工作台",
  "自动化与测试",
  "其他项目",
] as const;

/** A presentation layer: physical workspaces and resume identities never move. */
export function workspaceCollection(path: string): (typeof COLLECTION_ORDER)[number] {
  const p = path.replaceAll("\\", "/").replace(/\/+$/, "");
  if (/(?:\/work\/.*(?:smoke|test)(?:\/|$)|\/automations?(?:\/|$))/i.test(p)) return "自动化与测试";
  if (/\/Documents\/(?:项目管理|项目资料)(?:\/|$)/.test(p)) return "项目管理";
  if (/\/Documents\/自媒体(?:\/|$)/.test(p)) return "自媒体";
  if (/\/Documents\/公司管理(?:\/|$)/.test(p)) return "公司管理";
  if (/\/Documents\/交易(?:\/|$)/.test(p)) return "交易";
  if (
    /\/Documents\/Codex(?:\/|$)|\/\.t3\/scratch(?:\/|$)|\/Claude\/scratch-workspaces(?:\/|$)/.test(
      p,
    )
  )
    return "AI 工作台";
  return "其他项目";
}

export function buildWorkspaceCollections(input: {
  projects: readonly Project[];
  settings: ProjectGroupingSettings;
  preferredEnvironmentId?: EnvironmentId | null;
}) {
  const originals = buildProjectGroups(input);
  const collections = new Map<string, (typeof originals)[number]>();
  for (const group of originals) {
    const label = workspaceCollection(group.representative.workspaceRoot);
    const key = JSON.stringify(["workspace-collection", group.representative.environmentId, label]);
    const current = collections.get(key);
    if (!current) {
      collections.set(key, { ...group, key, label });
      continue;
    }
    const members = [...current.members, ...group.members];
    // New conversations default to the actual category root, never a random dated scratch folder.
    const representative = [...members].sort((a, b) => {
      const aRoot = Number(
        a.project.workspaceRoot.replace(/\/+$/, "").endsWith(`/Documents/${label}`),
      );
      const bRoot = Number(
        b.project.workspaceRoot.replace(/\/+$/, "").endsWith(`/Documents/${label}`),
      );
      return bRoot - aRoot || a.project.workspaceRoot.length - b.project.workspaceRoot.length;
    })[0]!.project;
    collections.set(key, {
      ...current,
      representative,
      members,
      memberProjectRefs: [...current.memberProjectRefs, ...group.memberProjectRefs],
    });
  }
  return [...collections.values()].sort(
    (a, b) =>
      COLLECTION_ORDER.indexOf(a.label as (typeof COLLECTION_ORDER)[number]) -
      COLLECTION_ORDER.indexOf(b.label as (typeof COLLECTION_ORDER)[number]),
  );
}
