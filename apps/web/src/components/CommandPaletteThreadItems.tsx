import { requestSpotlightMatch } from "./chat/spotlightMatchBus";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadSearchMatchKey } from "@t3tools/client-runtime/state/thread-search";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquareIcon } from "lucide-react";

import { useClientSettings } from "../hooks/useSettings";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  type ProviderInstanceEntry,
} from "../providerInstances";
import { useThreadShells } from "../state/entities";
import {
  useEnvironmentProviders,
  useEnvironments,
  usePrimaryEnvironmentId,
} from "../state/environments";
import { useThreadSearch } from "../state/queries";
import { primaryServerProvidersAtom } from "../state/server";
import { buildThreadRouteParams } from "../threadRoutes";
import {
  buildThreadActionItems,
  ITEM_ICON_CLASS,
  RECENT_THREAD_LIMIT,
  type CommandPaletteActionItem,
} from "./CommandPalette.logic";
import { useEnvironmentLookups, useProjectLookups } from "./CommandPaletteLookups";
import { ThreadCommandSubtitle } from "./ThreadCommandSubtitle";
import {
  ThreadRowLeadingStatus,
  ThreadRowTrailingStatus,
  ThreadSearchPullRequestNumber,
} from "./ThreadStatusIndicators";

function useProviderEntryByEnvironmentAndInstanceId() {
  const { environments } = useEnvironments();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const providersByEnvironment = useEnvironmentProviders();
  return new Map<string, ProviderInstanceEntry>(
    environments.flatMap((environment) => {
      const serverConfig = environment.serverConfig;
      const derived = deriveProviderInstanceEntries(
        providersByEnvironment.get(environment.environmentId) ??
          (environment.environmentId === primaryEnvironmentId ? providers : []),
      );
      const entries = serverConfig
        ? applyProviderInstanceSettings(derived, serverConfig.settings, null)
        : derived;
      return entries.map(
        (entry) => [`${environment.environmentId}:${entry.instanceId}`, entry] as const,
      );
    }),
  );
}

function useThreadSearchWithContentMatches(query: string) {
  const { environments } = useEnvironments();
  const environmentIds: ReadonlyArray<EnvironmentId> = environments
    .filter((environment) => environment.connection.phase === "connected")
    .map((environment) => environment.environmentId);
  const threadSearch = useThreadSearch(environmentIds, query);
  const contentMatchByKey = new Map(
    threadSearch.matches.flatMap((match) =>
      match.source === "user" || match.source === "assistant"
        ? [[threadSearchMatchKey(match), match] as const]
        : [],
    ),
  );
  return { threadSearch, contentMatchByKey };
}

/** Every thread as a palette item, with message matches for a non-empty `threadSearchQuery`. */
export function useCommandPaletteThreadItems(input: {
  readonly activeThreadId: ThreadId | undefined;
  readonly threadSearchQuery: string;
}) {
  const { activeThreadId, threadSearchQuery } = input;
  const navigate = useNavigate();
  const threads = useThreadShells();
  const sidebarThreadSortOrder = useClientSettings((settings) => settings.sidebarThreadSortOrder);
  const { projectEnvironmentLocationById } = useEnvironmentLookups();
  const providerEntryByEnvironmentAndInstanceId = useProviderEntryByEnvironmentAndInstanceId();
  const { threadSearch, contentMatchByKey } = useThreadSearchWithContentMatches(threadSearchQuery);
  const { projectByKey, projectTitleById } = useProjectLookups();

  const threadItems = buildThreadActionItems({
    threads,
    ...(activeThreadId ? { activeThreadId } : {}),
    projectTitleById,
    sortOrder: sidebarThreadSortOrder,
    icon: <MessageSquareIcon className={ITEM_ICON_CLASS} />,
    renderLeadingContent: (thread) => <ThreadRowLeadingStatus thread={thread} />,
    renderTrailingContent: (thread) => (
      <>
        <ThreadSearchPullRequestNumber
          thread={thread}
          query={threadSearchQuery}
          settled={thread.settledOverride === "settled"}
        />
        <ThreadRowTrailingStatus thread={thread} />
      </>
    ),
    renderDescription: (thread, { projectTitle }) => {
      const modelInstanceId =
        thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId;
      const providerEntry =
        providerEntryByEnvironmentAndInstanceId.get(`${thread.environmentId}:${modelInstanceId}`) ??
        null;
      return (
        <ThreadCommandSubtitle
          project={projectByKey.get(`${thread.environmentId}:${thread.projectId}`) ?? null}
          projectTitle={projectTitle ?? null}
          environmentLabel={
            projectEnvironmentLocationById.get(thread.environmentId)?.label ?? "Remote"
          }
          branch={thread.branch}
          worktreePath={thread.worktreePath}
          isCurrent={thread.id === activeThreadId}
          driverKind={providerEntry?.driverKind ?? null}
          providerDisplayName={
            thread.runtime?.providerName ?? providerEntry?.displayName ?? modelInstanceId
          }
          acpRegistryAgentId={providerEntry?.acpRegistryAgentId}
          acpRegistryIconUrl={providerEntry?.acpRegistryIconUrl}
        />
      );
    },
    getContentMatch: (thread) => {
      const match = contentMatchByKey.get(
        threadSearchMatchKey({
          environmentId: thread.environmentId,
          threadId: thread.id,
        }),
      );
      return match && (match.source === "user" || match.source === "assistant")
        ? {
            source: match.source,
            snippet: match.snippet,
            query: threadSearch.query,
          }
        : undefined;
    },
    runThread: async (thread) => {
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
      });
    },
  });

  const spotlightItems: CommandPaletteActionItem[] = threadSearch.matches.map((match) => {
    const local = threadItems.find((item) => item.value === `thread:${match.threadId}`);
    const target = scopeThreadRef(match.environmentId, match.threadId);
    const subtitle = [
      projectTitleById.get(match.projectId),
      match.archivedAt ? "已归档" : "",
      match.isSubagent ? "子任务" : "",
      match.matchedQuery && match.matchedQuery !== threadSearch.query ? "近似匹配" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      kind: "action",
      value: `thread:${match.environmentId}:${match.threadId}`,
      title: match.title ?? local?.title ?? match.threadId,
      searchTerms: [threadSearch.query, match.title ?? "", match.snippet],
      icon: <MessageSquareIcon className={ITEM_ICON_CLASS} />,
      description: subtitle,
      ...(match.score !== undefined ? { searchScore: match.score } : {}),
      ...(match.familyKey
        ? {
            searchFamilyKey: `${match.environmentId}:${match.familyKey}`,
            ...(match.familyTitle ? { searchFamilyTitle: match.familyTitle } : {}),
          }
        : {}),
      ...(match.isSubagent !== undefined ? { searchSubagent: match.isSubagent } : {}),
      searchRelatedItems: (match.familyThreads ?? []).map((member) => ({
        kind: "action",
        value: `thread:${match.environmentId}:${member.threadId}`,
        title: member.title,
        description: member.archivedAt ? "已归档" : "",
        searchTerms: [member.title],
        searchRecency: Date.parse(member.updatedAt),
        icon: <MessageSquareIcon className={ITEM_ICON_CLASS} />,
        run: async () => {
          await navigate({
            to: "/$environmentId/$threadId",
            params: buildThreadRouteParams(scopeThreadRef(match.environmentId, member.threadId)),
          });
        },
      })),
      ...(local?.timestamp ? { timestamp: local.timestamp } : {}),
      ...(match.messageId
        ? {
            threadContentMatch: {
              source: match.source,
              snippet: match.snippet,
              query: match.matchedQuery ?? threadSearch.query,
            },
          }
        : {}),
      run: async () => {
        if (match.messageId)
          requestSpotlightMatch({
            thread: target,
            query: match.matchedQuery ?? threadSearch.query,
            messageId: match.messageId,
          });
        await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(target) });
      },
    };
  });
  const serverItemIds = new Set(threadSearch.matches.map((match) => `thread:${match.threadId}`));
  const threadItemsForSearch = [
    ...spotlightItems,
    ...threadItems.filter((item) => !serverItemIds.has(item.value)),
  ];
  const mainThreadIds = new Set(
    threads
      .filter((thread) => thread.lineage.relationshipToParent !== "subagent")
      .map((thread) => `thread:${thread.id}`),
  );
  const recentThreadItems = threadItems
    .filter((item) => mainThreadIds.has(item.value))
    .slice(0, RECENT_THREAD_LIMIT);

  return {
    threadItems,
    threadItemsForSearch,
    recentThreadItems,
    isSearchPending: threadSearch.isPending,
    searchError: threadSearch.error,
  };
}
