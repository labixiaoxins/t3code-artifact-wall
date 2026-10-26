import { useState } from "react";
import { Input } from "../ui/input";
import { uiText } from "~/i18n";
import { settingsScopeEnvironmentLabels } from "./settingsScopeAxis";
import { Spinner } from "~/components/ui/spinner";
import { ArchiveIcon, ArchiveX } from "lucide-react";
import { type ScopedThreadRef } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useSettingsScope } from "./SettingsScopeContext";
import { useThreadActions } from "../../hooks/useThreadActions";
import { readLocalApi } from "../../localApi";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { RelativeTime } from "../RelativeTime";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";
import { ProjectFavicon } from "../ProjectFavicon";

export function ArchivedThreadsPanel() {
  const { scope, groups: projectGroups, environments } = useSettingsScope();
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  const { unarchiveThread, confirmAndDeleteThread } = useThreadActions();
  const {
    snapshots: archivedSnapshots,
    error: archiveError,
    isLoading: isLoadingArchive,
    refresh: refreshArchivedThreads,
  } = useArchivedThreadSnapshots(scope.environmentIds);

  const { groups: archivedGroups, hasMultipleEnvironments } = (() => {
    const selectedProjectKeys =
      scope.kind === "project" || scope.kind === "checkout"
        ? new Set(scope.members.map((member) => `${member.environmentId}:${member.id}`))
        : null;
    const projectsByEnvironmentAndId = new Map(
      archivedSnapshots.flatMap(({ environmentId, snapshot }) =>
        snapshot.projects
          .filter(
            (project) =>
              selectedProjectKeys === null ||
              selectedProjectKeys.has(`${environmentId}:${project.id}`),
          )
          .map(
            (project) => [`${environmentId}:${project.id}`, { ...project, environmentId }] as const,
          ),
      ),
    );
    const environmentLabels = new Map(
      environments.map((environment) => {
        const { primary, secondary } = settingsScopeEnvironmentLabels(environment, environments);
        return [environment.environmentId, secondary ? `${primary} (${secondary})` : primary];
      }),
    );
    const threads = archivedSnapshots.flatMap(({ environmentId, snapshot }) =>
      snapshot.threads.map((thread) => ({
        ...presentThreadShell(environmentId, thread),
        environmentLabel: environmentLabels.get(environmentId) ?? environmentId,
      })),
    );
    const hasMultipleEnvironments =
      new Set(
        threads
          .filter((thread) =>
            projectsByEnvironmentAndId.has(`${thread.environmentId}:${thread.projectId}`),
          )
          .map((thread) => thread.environmentId),
      ).size > 1;
    const logicalGroupsByProjectKey = new Map(
      projectGroups.flatMap((group) =>
        group.memberProjectRefs.map(
          (member) => [`${member.environmentId}:${member.projectId}`, group] as const,
        ),
      ),
    );

    const archivedProjects = Array.from(projectsByEnvironmentAndId.values());
    const groups = new Map<
      string,
      {
        readonly project: (typeof archivedProjects)[number];
        readonly title: string;
        readonly threads: Array<(typeof threads)[number]>;
      }
    >();
    for (const project of archivedProjects) {
      const projectThreads: Array<(typeof threads)[number]> = [];
      for (const thread of threads) {
        if (thread.projectId === project.id && thread.environmentId === project.environmentId) {
          projectThreads.push(thread);
        }
      }
      if (projectThreads.length > 0) {
        const physicalProjectKey = `${project.environmentId}:${project.id}` as const;
        const logicalGroup = hasMultipleEnvironments
          ? logicalGroupsByProjectKey.get(physicalProjectKey)
          : undefined;
        const groupKey = logicalGroup?.projectKey ?? physicalProjectKey;
        const group = groups.get(groupKey);
        if (group) {
          group.threads.push(...projectThreads);
        } else {
          groups.set(groupKey, {
            project,
            title: logicalGroup?.displayName ?? project.title,
            threads: projectThreads,
          });
        }
      }
    }
    const sortedGroups = Array.from(groups, ([key, group]) => ({
      ...group,
      key,
      threads: group.threads.toSorted((left, right) => {
        const leftKey = left.archivedAt ?? left.createdAt;
        const rightKey = right.archivedAt ?? right.createdAt;
        return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
      }),
    }));
    return { groups: sortedGroups, hasMultipleEnvironments };
  })();

  const handleArchivedThreadContextMenu = async (
    threadRef: ScopedThreadRef,
    position: { x: number; y: number },
  ) => {
    const api = readLocalApi();
    if (!api) return;
    const clicked = await api.contextMenu.show(
      [
        { id: "unarchive", label: "Unarchive" },
        { id: "delete", label: uiText("Delete"), destructive: true },
      ],
      position,
    );

    if (clicked === "unarchive") {
      const result = await unarchiveThread(threadRef);
      if (result._tag === "Success") {
        refreshArchivedThreads();
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to unarchive thread",
            description: error instanceof Error ? error.message : uiText("An error occurred."),
          }),
        );
      }
      return;
    }

    if (clicked === "delete") {
      const result = await confirmAndDeleteThread(threadRef);
      if (result._tag === "Success") {
        refreshArchivedThreads();
      } else if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: uiText("Failed to delete thread"),
            description: error instanceof Error ? error.message : uiText("An error occurred."),
          }),
        );
      }
    }
  };

  const query = searchQuery.trim().toLocaleLowerCase();
  const filteredGroups = archivedGroups
    .map((group) => ({
      ...group,
      threads: query
        ? group.threads.filter((thread) => thread.title.toLocaleLowerCase().includes(query))
        : group.threads,
    }))
    .filter((group) => group.threads.length > 0);
  const toggleGroup = (key: string) =>
    setCollapsedKeys((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  return (
    <SettingsPageContainer>
      <div className="mb-4 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            筛选范围：
            {scope.kind === "project" || scope.kind === "checkout"
              ? "项目范围"
              : scope.kind === "environment"
                ? "环境范围"
                : "全局范围"}{" "}
            · 共 {archivedGroups.reduce((sum, group) => sum + group.threads.length, 0)} 个已归档会话
          </span>
          {archivedGroups.length > 1 ? (
            <div className="flex gap-1">
              <Button variant="ghost" size="xs" onClick={() => setCollapsedKeys(new Set())}>
                全部展开
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => setCollapsedKeys(new Set(archivedGroups.map((group) => group.key)))}
              >
                全部折叠
              </Button>
            </div>
          ) : null}
        </div>
        {archivedGroups.length > 0 ? (
          <Input
            type="search"
            placeholder="按会话标题搜索已归档会话…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        ) : null}
        {query && archivedGroups.length > 0 && filteredGroups.length === 0 ? (
          <p role="status" className="text-xs text-muted-foreground">
            未找到匹配的已归档会话，请尝试其他关键词。
          </p>
        ) : null}
      </div>
      {archivedGroups.length === 0 ? (
        <SettingsSection
          id={isLoadingArchive ? undefined : searchableSetting("archive").id}
          title={searchableSetting("archive").title}
        >
          <SettingsRow
            title={
              <span className="inline-flex items-center gap-2">
                {isLoadingArchive ? (
                  <Spinner size="sm" tone="muted" />
                ) : (
                  <ArchiveIcon className="size-3.5 text-muted-foreground" />
                )}
                {isLoadingArchive
                  ? "Loading archived threads"
                  : archiveError
                    ? "Could not load archived threads"
                    : "No archived threads"}
              </span>
            }
            description={
              isLoadingArchive
                ? "Checking connected environments."
                : (archiveError ?? "Archived threads will appear here.")
            }
          />
        </SettingsSection>
      ) : (
        filteredGroups.map(({ key, project, title, threads: projectThreads }, index) => (
          <SettingsSection
            key={key}
            id={index === 0 ? searchableSetting("archive").id : undefined}
            title={title}
            icon={<ProjectFavicon project={project} />}
            headerAction={
              <Button
                variant="ghost"
                size="xs"
                onClick={() => toggleGroup(key)}
                aria-expanded={!collapsedKeys.has(key)}
                aria-label={`${collapsedKeys.has(key) ? "展开" : "折叠"} ${title}`}
              >
                {collapsedKeys.has(key) ? `展开 (${projectThreads.length})` : "折叠"}
              </Button>
            }
          >
            {!collapsedKeys.has(key) &&
              projectThreads.map((thread) => (
                <SettingsRow
                  key={`${thread.environmentId}:${thread.id}`}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    void (async () => {
                      const result = await settlePromise(() =>
                        handleArchivedThreadContextMenu(
                          scopeThreadRef(thread.environmentId, thread.id),
                          {
                            x: event.clientX,
                            y: event.clientY,
                          },
                        ),
                      );
                      if (result._tag === "Failure") {
                        const error = squashAtomCommandFailure(result);
                        toastManager.add(
                          stackedThreadToast({
                            type: "error",
                            title: "Archived thread action failed",
                            description:
                              error instanceof Error ? error.message : uiText("An error occurred."),
                          }),
                        );
                      }
                    })();
                  }}
                  title={thread.title}
                  description={
                    <span className={hasMultipleEnvironments ? "block truncate" : undefined}>
                      {hasMultipleEnvironments ? `${thread.environmentLabel} · ` : null}
                      Archived <RelativeTime timestamp={thread.archivedAt ?? thread.createdAt} />
                      {" \u00b7 Created "}
                      <RelativeTime timestamp={thread.createdAt} />
                    </span>
                  }
                  control={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => {
                        void (async () => {
                          const result = await unarchiveThread(
                            scopeThreadRef(thread.environmentId, thread.id),
                          );
                          if (result._tag === "Success") {
                            refreshArchivedThreads();
                            return;
                          }
                          if (!isAtomCommandInterrupted(result)) {
                            const error = squashAtomCommandFailure(result);
                            toastManager.add(
                              stackedThreadToast({
                                type: "error",
                                title: "Failed to unarchive thread",
                                description:
                                  error instanceof Error
                                    ? error.message
                                    : uiText("An error occurred."),
                              }),
                            );
                          }
                        })();
                      }}
                    >
                      <ArchiveX className="size-3.5" />
                      <span>Unarchive</span>
                    </Button>
                  }
                />
              ))}
          </SettingsSection>
        ))
      )}
    </SettingsPageContainer>
  );
}
