import { useMemo, useState } from "react";
import type { DraftId } from "../../composerDraftStore";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { useProjects, useThreadShells } from "../../state/entities";
import { useClientSettings } from "../../hooks/useSettings";
import { selectProjectGroupingSettings } from "../../logicalProject";
import { buildSidebarProjectSnapshots } from "../../sidebarProjectGrouping";
import {
  compactWorkspacePath,
  projectMemberMenu,
  rememberDefaultMember,
} from "../../projectMemberSelection";
import { useComposerDraftStore } from "../../composerDraftStore";
import { readLocalApi } from "../../localApi";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { useEnvironments } from "../../state/environments";
import type { Project } from "../../types";

export function DraftWorkspaceNotice({
  draftId,
  project,
  workspacePath,
  canChange,
}: {
  draftId: DraftId;
  project: Project;
  workspacePath: string;
  canChange: () => boolean;
}) {
  const projects = useProjects();
  const threads = useThreadShells();
  const settings = useClientSettings(selectProjectGroupingSettings);
  const { environments } = useEnvironments();
  const [choosing, setChoosing] = useState(false);
  const category = useMemo(
    () =>
      buildSidebarProjectSnapshots({
        projects,
        settings,
        primaryEnvironmentId: project.environmentId,
        resolveEnvironmentLabel: (id) =>
          environments.find((env) => env.environmentId === id)?.label ?? null,
      }).find((group) =>
        group.memberProjects.some(
          (member) => member.environmentId === project.environmentId && member.id === project.id,
        ),
      ),
    [projects, settings, project, environments],
  );
  const change = async (event: React.MouseEvent) => {
    if (!category || choosing || !canChange()) return;
    const api = readLocalApi();
    if (!api) return;
    const original = useComposerDraftStore.getState().getDraftSession(draftId);
    if (!original || original.promotedTo) return;
    setChoosing(true);
    try {
      const selected = await api.contextMenu.show(
        projectMemberMenu(category.memberProjects, threads),
        { x: event.clientX, y: event.clientY },
      );
      const member = category.memberProjects.find((item) => item.physicalProjectKey === selected);
      const store = useComposerDraftStore.getState();
      const current = store.getDraftSession(draftId);
      if (
        !member ||
        !current ||
        current.promotedTo ||
        current.projectId !== original.projectId ||
        current.environmentId !== original.environmentId ||
        !canChange()
      )
        return;
      store.setDraftThreadContext(draftId, {
        projectRef: scopeProjectRef(member.environmentId, member.id),
        environmentSelection: "manual",
        loadBalancedEnvironmentId: null,
      });
      if (!rememberDefaultMember(category.projectKey, member))
        toastManager.add({ type: "warning", title: "目录已更换，但本机默认目录保存失败" });
    } catch {
      toastManager.add({ type: "error", title: "无法更换目录，请重试" });
    } finally {
      setChoosing(false);
    }
  };
  return (
    <div
      data-draft-workspace-notice
      className="flex min-w-0 items-center gap-1 px-3 py-1 text-xs text-muted-foreground"
    >
      <Tooltip>
        <TooltipTrigger render={<span className="min-w-0 truncate" />}>
          在 {compactWorkspacePath(workspacePath)} 中运行
        </TooltipTrigger>
        <TooltipPopup>{workspacePath}</TooltipPopup>
      </Tooltip>
      <span>·</span>
      <button
        type="button"
        className="shrink-0 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        disabled={choosing}
        onClick={(event) => void change(event)}
      >
        更换
      </button>
    </div>
  );
}
