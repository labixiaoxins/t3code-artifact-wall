import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import { RunInspector } from "./RunInspector";
import { uiText } from "~/i18n";
import { ContinuationHistoryPanel } from "./ContinuationHistoryPanel";
import { ArtifactWall } from "./ArtifactWall";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type {
  EditorId,
  EnvironmentId,
  ProjectId,
  ProjectScript,
  ResolvedKeybindingsConfig,
  ThreadId,
} from "@t3tools/contracts";

import type { DraftId } from "../../composerDraftStore";
import { useT3ProjectFileScripts } from "../../hooks/useT3ProjectFileScripts";
import { type EnvMode, type EnvironmentOption } from "../BranchToolbar.logic";
import { BranchToolbar } from "../BranchToolbar";
import BaseGitActionsControl from "../GitActionsControl";
import ProjectScriptsControl, {
  type NewProjectScriptInput,
  type ProjectScriptActionResult,
} from "../ProjectScriptsControl";
import { memo, useState, type ComponentProps } from "react";
import { InspectorTabBar } from "./InspectorTabBar";
import { resolveInspectorTab, useInspectorTab, type InspectorTab } from "../../inspectorTabs";
import { nextArtifactCount, type ArtifactCountState } from "../../artifactWall";
import { ThreadDetailsCard } from "./ThreadDetailsCard";
import { OpenInPicker } from "./OpenInPicker";
import { ThreadDetailsSection } from "./ThreadDetailsSection";
import { ThreadAutomationsPanel } from "./ThreadAutomationsPanel";
import { ThreadRelationshipsPanel } from "./ThreadRelationshipsControl";

const GitActionsControl = memo(BaseGitActionsControl);

export interface ThreadDetailsPanelProps extends Pick<
  ComponentProps<typeof ThreadDetailsCard>,
  "anchor" | "handle"
> {
  forceNewWorktree?: boolean;
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projectId: ProjectId;
  worktreePath: string | null;
  isServerThread: boolean;
  draftId?: DraftId;
  continuation?: {
    thread: EnvironmentThreadShell;
    projection: ThreadStructure | null;
    onQuote: (text: string) => boolean;
  };
  onAttachArtifactFiles?: (files: File[]) => void;
  activeProjectName: string | undefined;
  activeProjectScripts: ReadonlyArray<ProjectScript> | undefined;
  preferredScriptId: string | null;
  keybindings: ResolvedKeybindingsConfig;
  availableEditors: ReadonlyArray<EditorId>;
  showOpenInPicker: boolean;
  openInShortcutEnabled: boolean;
  gitCwd: string | null;
  isGitRepo: boolean;
  envLocked: boolean;
  availableEnvironments: readonly EnvironmentOption[];
  autoEnvironmentLabel?: string | undefined;
  onAutoEnvironment?: (() => void) | undefined;
  onEnvironmentChange?: (environmentId: EnvironmentId) => void;
  onEnvModeChange: (mode: EnvMode) => void;
  envMode: EnvMode;
  activeThreadBranchOverride?: string | null;
  onActiveThreadBranchOverrideChange?: (branch: string | null) => void;
  startFromOrigin: boolean;
  onStartFromOriginChange: (startFromOrigin: boolean) => void;
  onCheckoutPullRequestRequest?: (reference: string) => void;
  onComposerFocusRequest: () => void;
  onOpenChanges?: () => void;
  onRunProjectScript: (script: ProjectScript) => void;
  onAddProjectScript: (input: NewProjectScriptInput) => Promise<ProjectScriptActionResult>;
  onUpdateProjectScript: (
    scriptId: string,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDeleteProjectScript: (scriptId: string) => Promise<ProjectScriptActionResult>;
}

export function ThreadDetailsPanel(props: ThreadDetailsPanelProps) {
  const fileScripts = useT3ProjectFileScripts(
    props.environmentId,
    props.activeProjectScripts ? props.gitCwd : null,
  );
  const activeThreadRef = { environmentId: props.environmentId, threadId: props.threadId };
  const hasHistory = !props.draftId && props.continuation !== undefined;
  const hasArtifacts = !props.draftId && props.onAttachArtifactFiles !== undefined;
  const availableTabs: InspectorTab[] = [
    ...(hasArtifacts ? (["artifacts"] as const) : []),
    ...(hasHistory ? (["history"] as const) : []),
    ...(!props.draftId ? (["run"] as const) : []),
    "project",
  ];
  const [storedTab, setStoredTab] = useInspectorTab();
  const tab = resolveInspectorTab(storedTab, availableTabs);
  const countKey = `${props.environmentId}:${props.threadId}`;
  const [artifactCount, setArtifactCount] = useState<ArtifactCountState | null>(null);
  const tabLabels: Record<InspectorTab, string> = {
    artifacts: artifactCount?.key === countKey ? `产物 ${artifactCount.count}` : "产物",
    history: "续聊",
    run: uiText("Run"),
    project: "项目",
  };
  const branchToolbarProps = {
    showGitControls: props.isGitRepo,
    environmentId: props.environmentId,
    threadId: props.threadId,
    projectId: props.projectId,
    worktreePath: props.worktreePath,
    isServerThread: props.isServerThread,
    ...(props.draftId ? { draftId: props.draftId } : {}),
    onEnvModeChange: props.onEnvModeChange,
    startFromOrigin: props.startFromOrigin,
    onStartFromOriginChange: props.onStartFromOriginChange,
    envMode: props.envMode,
    ...(props.activeThreadBranchOverride !== undefined
      ? { activeThreadBranchOverride: props.activeThreadBranchOverride }
      : {}),
    ...(props.onActiveThreadBranchOverrideChange
      ? { onActiveThreadBranchOverrideChange: props.onActiveThreadBranchOverrideChange }
      : {}),
    envLocked: props.envLocked,
    forceNewWorktree: props.forceNewWorktree ?? false,
    onComposerFocusRequest: props.onComposerFocusRequest,
    ...(props.onCheckoutPullRequestRequest
      ? { onCheckoutPullRequestRequest: props.onCheckoutPullRequestRequest }
      : {}),
  };

  return (
    <ThreadDetailsCard
      threadRef={{ environmentId: props.environmentId, threadId: props.threadId }}
      anchor={props.anchor}
      handle={props.handle}
    >
      {(density) => (
        <>
          {availableTabs.length > 1 ? (
            <InspectorTabBar
              tabs={availableTabs}
              labels={tabLabels}
              value={tab}
              onChange={setStoredTab}
            />
          ) : null}
          {tab === "history" && hasHistory && props.continuation ? (
            <ContinuationHistoryPanel
              environmentId={props.environmentId}
              emptyLabel={"这个会话没有续聊记录"}
              {...props.continuation}
            />
          ) : null}
          {hasArtifacts && props.onAttachArtifactFiles ? (
            <ArtifactWall
              environmentId={props.environmentId}
              threadId={props.threadId}
              onAttach={props.onAttachArtifactFiles}
              {...(props.continuation ? { onRevise: props.continuation.onQuote } : {})}
              active={tab === "artifacts"}
              onCount={(count) =>
                setArtifactCount((previous) => nextArtifactCount(previous, countKey, count))
              }
            />
          ) : null}
          {tab === "run" ? (
            <RunInspector environmentId={props.environmentId} threadId={props.threadId} />
          ) : null}
          {tab === "project" ? (
            <>
              <ThreadDetailsSection
                headingId={"thread-details-workspace-heading"}
                title={uiText("Workspace")}
                separated={false}
                showHeading={false}
              >
                <div className={"flex flex-col"}>
                  {density === "full" ? (
                    <BranchToolbar
                      layout={"panel"}
                      panelSection={"workspace"}
                      availableEnvironments={props.availableEnvironments}
                      {...(props.onEnvironmentChange
                        ? { onEnvironmentChange: props.onEnvironmentChange }
                        : {})}
                      autoEnvironmentLabel={props.autoEnvironmentLabel}
                      onAutoEnvironment={props.onAutoEnvironment}
                      {...branchToolbarProps}
                    />
                  ) : null}
                  {density !== "essential" && props.showOpenInPicker ? (
                    <OpenInPicker
                      keybindings={props.keybindings}
                      environmentId={props.environmentId}
                      availableEditors={props.availableEditors}
                      openInCwd={props.gitCwd}
                      enableShortcut={props.openInShortcutEnabled}
                      displayMode={"panel"}
                    />
                  ) : null}
                  {props.activeProjectScripts ? (
                    <ProjectScriptsControl
                      environmentId={props.environmentId}
                      displayMode={"panel"}
                      scripts={props.activeProjectScripts}
                      fileScripts={fileScripts}
                      preferredScriptId={props.preferredScriptId}
                      onRunScript={props.onRunProjectScript}
                      onAddScript={props.onAddProjectScript}
                      onUpdateScript={props.onUpdateProjectScript}
                      onDeleteScript={props.onDeleteProjectScript}
                    />
                  ) : null}
                </div>
              </ThreadDetailsSection>
              {props.gitCwd ? (
                <ThreadDetailsSection
                  headingId={"thread-details-version-control-heading"}
                  title={uiText("Version Control")}
                  showHeading={false}
                  separated={density === "full"}
                >
                  <div className={"flex flex-col"}>
                    {props.isGitRepo ? (
                      <BranchToolbar
                        layout={"panel"}
                        panelSection={"branch"}
                        {...branchToolbarProps}
                      />
                    ) : null}
                    {props.activeProjectName ? (
                      <GitActionsControl
                        displayMode={"panel"}
                        compact={density !== "full"}
                        gitCwd={props.gitCwd}
                        activeThreadRef={activeThreadRef}
                        {...(props.draftId ? { draftId: props.draftId } : {})}
                        {...(props.onOpenChanges ? { onOpenChanges: props.onOpenChanges } : {})}
                      />
                    ) : null}
                  </div>
                </ThreadDetailsSection>
              ) : null}
              {density === "full" && !props.draftId ? (
                <ThreadAutomationsPanel
                  environmentId={props.environmentId}
                  threadId={props.threadId}
                />
              ) : null}
              {density === "full" && !props.draftId ? (
                <ThreadRelationshipsPanel
                  environmentId={props.environmentId}
                  threadId={props.threadId}
                />
              ) : null}
            </>
          ) : null}
        </>
      )}
    </ThreadDetailsCard>
  );
}
