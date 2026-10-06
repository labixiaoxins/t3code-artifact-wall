import {
  DEFAULT_MODEL_BY_PROVIDER,
  ProviderDriverKind,
  type ModelSelection,
  type ServerConfig,
  type EnvironmentId,
} from "@t3tools/contracts";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";
import type { SidebarThreadSummary } from "./types";
import type { ThreadPlacements } from "./sidebarThreadPlacement";

export const providerExpansionKey = (provider: string) => `provider-group:${provider}`;

export function isAutomationThread(thread: {
  modelSelection: ModelSelection;
  title?: string;
}): boolean {
  return (
    thread.modelSelection.model === "codex-auto-review" ||
    /^(自动审批|自动化测试|生图执行记录|Call your built-in image generation tool)/.test(
      thread.title ?? "",
    )
  );
}

export function sidebarProviderLabel(driver: string): string {
  if (driver.toLowerCase() === "codex") return "Codex";
  if (["claude", "claudeagent"].includes(driver.toLowerCase())) return "Claude";
  return (
    { grok: "Grok", antigravity: "Antigravity", cursor: "Cursor", opencode: "OpenCode" }[driver] ??
    driver
  );
}

export function groupSidebarByProvider(
  projects: readonly SidebarProjectSnapshot[],
  threads: readonly (Pick<
    SidebarThreadSummary,
    "id" | "projectId" | "environmentId" | "modelSelection"
  > &
    Partial<Pick<SidebarThreadSummary, "title">>)[],
  configs: ReadonlyMap<EnvironmentId, Pick<ServerConfig, "settings">>,
  placements: ThreadPlacements = {},
): SidebarProjectSnapshot[] {
  const projectByKey = new Map(projects.map((project) => [project.projectKey, project]));
  const placementFor = (thread: (typeof threads)[number]) => {
    const target = projectByKey.get(
      placements[scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id))] ?? "",
    );
    // Missing targets fall back to the original grouping; remote threads never cross environments.
    return target?.environmentId === thread.environmentId ? target : undefined;
  };
  const groups = new Map<string, SidebarProjectSnapshot[]>([
    ["Codex", []],
    ["Claude", []],
  ]);
  const resolveLabel = (environmentId: EnvironmentId, selection: ModelSelection | null) => {
    if (selection === null) return "Codex";
    const instanceId = selection.instanceId;
    return sidebarProviderLabel(
      configs.get(environmentId)?.settings.providerInstances[instanceId]?.driver ?? instanceId,
    );
  };
  const automation = new Map<
    string,
    { project: SidebarProjectSnapshot; threads: (typeof threads)[number][] }
  >();
  const collectAutomation = (project: SidebarProjectSnapshot, thread: (typeof threads)[number]) => {
    const label = resolveLabel(thread.environmentId, thread.modelSelection);
    const key = JSON.stringify(["automation-collection", thread.environmentId, label]);
    const current = automation.get(key);
    if (current) {
      current.threads.push(thread);
      const refs = new Map(
        [...current.project.memberProjectRefs, ...project.memberProjectRefs].map((ref) => [
          JSON.stringify(ref),
          ref,
        ]),
      );
      const members = new Map(
        [...current.project.memberProjects, ...project.memberProjects].map((member) => [
          member.physicalProjectKey,
          member,
        ]),
      );
      current.project = {
        ...current.project,
        memberProjectRefs: [...refs.values()],
        memberProjects: [...members.values()],
        groupedProjectCount: members.size,
      };
    } else {
      automation.set(key, {
        project: {
          ...project,
          title: "自动化与测试",
          displayName: "自动化与测试",
          projectKey: key,
        },
        threads: [thread],
      });
    }
  };
  for (const project of projects) {
    const members = new Set(
      project.memberProjectRefs.map((ref) => JSON.stringify([ref.environmentId, ref.projectId])),
    );
    const allProjectThreads = threads.filter((thread) => {
      const target = placementFor(thread);
      return target
        ? target.projectKey === project.projectKey
        : members.has(JSON.stringify([thread.environmentId, thread.projectId]));
    });
    const projectThreads = allProjectThreads.filter((thread) => {
      if (
        project.displayName === "自动化与测试" ||
        (!placementFor(thread) && isAutomationThread(thread))
      ) {
        collectAutomation(project, thread);
        return false;
      }
      return true;
    });
    if (project.displayName === "自动化与测试") continue;
    const byProvider = new Map<string, Array<(typeof threads)[number]>>();
    for (const thread of projectThreads) {
      const label = resolveLabel(thread.environmentId, thread.modelSelection);
      const list = byProvider.get(label) ?? [];
      list.push(thread);
      byProvider.set(label, list);
    }
    if (byProvider.size === 0)
      byProvider.set(resolveLabel(project.environmentId, project.defaultModelSelection), []);
    for (const [label, providerThreads] of byProvider) {
      const list = groups.get(label) ?? [];
      list.push({
        ...project,
        projectKey: JSON.stringify(["provider-project", label, project.projectKey]),
        sourceProjectKey: project.projectKey,
        providerLabel: label,
        providerThreadKeys: new Set(
          providerThreads.map((thread) =>
            scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          ),
        ),
        providerModelSelection:
          providerThreads[0]?.modelSelection.model === "codex-auto-review"
            ? {
                ...providerThreads[0].modelSelection,
                model: DEFAULT_MODEL_BY_PROVIDER[ProviderDriverKind.make("codex")]!,
              }
            : (providerThreads[0]?.modelSelection ?? project.defaultModelSelection),
      });
      groups.set(label, list);
    }
  }
  for (const { project, threads: automatedThreads } of automation.values()) {
    const selection = automatedThreads[0]!.modelSelection;
    const label = resolveLabel(automatedThreads[0]!.environmentId, selection);
    const list = groups.get(label) ?? [];
    list.push({
      ...project,
      projectKey: JSON.stringify(["provider-project", label, project.projectKey]),
      sourceProjectKey: project.projectKey,
      providerLabel: label,
      providerThreadKeys: new Set(
        automatedThreads.map((thread) =>
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        ),
      ),
      providerModelSelection:
        selection.model === "codex-auto-review"
          ? { ...selection, model: DEFAULT_MODEL_BY_PROVIDER[ProviderDriverKind.make("codex")]! }
          : selection,
    });
    groups.set(label, list);
  }
  const secondaryRank = (name: string) =>
    name === "自动化与测试" ? 1 : name === "其他项目" ? 2 : 0;
  return [...groups.values()].flatMap((list) =>
    list.toSorted((a, b) => secondaryRank(a.displayName) - secondaryRank(b.displayName)),
  );
}

export function prioritizeUserThreads<T extends { modelSelection: ModelSelection }>(
  threads: readonly T[],
): T[] {
  return threads.toSorted(
    (a, b) =>
      Number(a.modelSelection.model === "codex-auto-review") -
      Number(b.modelSelection.model === "codex-auto-review"),
  );
}
