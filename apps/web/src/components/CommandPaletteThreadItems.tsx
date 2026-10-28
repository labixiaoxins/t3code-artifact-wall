import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { findForMessageMatch, openThreadFindOnQuery } from "./chat/threadFindStore";
import {
  claimThreadOpen,
  nextShownOrder,
  type EnvironmentThreadSearchMatch,
  type ShownOrder,
} from "@t3tools/client-runtime/state/thread-search";
import {
  foldSearchQuery,
  PALETTE_MESSAGE_LIMIT,
  pickedQuery,
  rankMessageMatches,
} from "@t3tools/shared/paletteSearch";
import { requestSpotlightMatch } from "./chat/spotlightMatchBus";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { MessageSquareIcon } from "lucide-react";
import { useState } from "react";
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
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { buildThreadRouteParams } from "../threadRoutes";
import { formatRelativeTimeLabel } from "../timestampFormat";
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
function useConnectedThreadSearch(query: string) {
  const { environments } = useEnvironments();
  const { projectEnvironmentLocationById } = useEnvironmentLookups();
  const environmentIds: ReadonlyArray<EnvironmentId> = environments
    .filter((environment) => environment.connection.phase === "connected")
    .map((environment) => environment.environmentId);
  // The palette matches environment names when there are several; older rows must match the same.
  const environmentLabels =
    environments.length > 1
      ? Object.fromEntries(
          environmentIds.flatMap((environmentId) => {
            const label = projectEnvironmentLocationById.get(environmentId)?.label;
            return label === undefined || label === null ? [] : [[environmentId, label]];
          }),
        )
      : undefined;
  return useThreadSearch(
    environmentIds,
    query,
    environmentLabels === undefined ? { spotlight: true } : { environmentLabels, spotlight: true },
  );
}
/**
 * Every visible thread as a palette item, plus, for a non-empty
 * `threadSearchQuery`, the threads whose messages match, best first.
 */
export function useCommandPaletteThreadItems(input: {
  readonly activeThread: {
    readonly environmentId: EnvironmentId;
    readonly id: ThreadId;
  } | null;
  readonly threadSearchQuery: string;
}) {
  const { activeThread, threadSearchQuery } = input;
  const navigate = useNavigate();
  const threads = useThreadShells();
  const { projectEnvironmentLocationById } = useEnvironmentLookups();
  const providerEntryByEnvironmentAndInstanceId = useProviderEntryByEnvironmentAndInstanceId();
  const messageSearch = useConnectedThreadSearch(threadSearchQuery);
  const { projectByKey } = useProjectLookups();
  const visitThread = useAtomCommand(threadEnvironment.visit, { reportFailure: false });
  // Ranking is relative to when the palette opened, so rows do not reorder as time passes.
  const [now] = useState(() => Date.now());
  const { environments } = useEnvironments();
  const threadItems = buildThreadActionItems({
    threads,
    ...(environments.length > 1
      ? {
          environmentLabelOf: (thread: (typeof threads)[number]) =>
            projectEnvironmentLocationById.get(thread.environmentId)?.label ?? null,
        }
      : {}),
    ...(activeThread ? { activeThread } : {}),
    projectByKey,
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
          isCurrent={
            thread.id === activeThread?.id && thread.environmentId === activeThread.environmentId
          }
          driverKind={providerEntry?.driverKind ?? null}
          providerDisplayName={
            thread.runtime?.providerName ?? providerEntry?.displayName ?? modelInstanceId
          }
          acpRegistryAgentId={providerEntry?.acpRegistryAgentId}
          acpRegistryIconUrl={providerEntry?.acpRegistryIconUrl}
        />
      );
    },
    runThread: async (thread) => {
      // A pick sends its open with the query, always, so the server records
      // it; the thread view then skips its own open. The open thread is no pick.
      const isOpen =
        activeThread?.environmentId === thread.environmentId && activeThread.id === thread.id;
      if (threadSearchQuery.trim().length > 0 && !threadSearchQuery.startsWith(">") && !isOpen) {
        // oxlint-disable-next-line react/purity -- runs in an event handler (oxc#27309)
        claimThreadOpen(thread.environmentId, thread.id, Date.now());
      }
      if (
        threadSearchQuery.trim().length > 0 &&
        !threadSearchQuery.startsWith(">") &&
        thread.lastVisitedAt !== undefined &&
        !isOpen
      ) {
        void visitThread({
          environmentId: thread.environmentId,
          input: {
            threadId: thread.id,
            visitedAt: thread.updatedAt,
            opened: true,
            searchQuery: pickedQuery(threadSearchQuery),
          },
        });
      }
      await navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
      });
    },
  });
  const itemByValue = new Map(threadItems.map((item) => [item.value, item]));
  const itemForMatch = (match: EnvironmentThreadSearchMatch) =>
    itemByValue.get(`thread:${match.environmentId}:${match.threadId}`);
  const rankedMessageItems = rankMessageMatches(
    messageSearch.matches,
    (match) => itemForMatch(match)?.threadSearch,
    foldSearchQuery(threadSearchQuery),
    now,
    { withoutTitleMatches: true },
  ).flatMap((match) => {
    const item = itemForMatch(match);
    if (!item) return [];
    // The snippet replaces the project line, so a message row is as tall as a title row.
    const { description: _description, ...rest } = item;
    return [
      {
        ...rest,
        // When the matching message was written, not when the thread last moved.
        ...(match.messageCreatedAt
          ? { timestamp: formatRelativeTimeLabel(match.messageCreatedAt) }
          : {}),
        threadContentMatch: {
          source: match.source,
          snippet: match.snippet,
          query: messageSearch.query,
        },
        // Opens the thread with find on the word at the matched message, so it is in view.
        run: async () => {
          await item.run();
          openThreadFindOnQuery(
            scopedThreadKey(scopeThreadRef(match.environmentId, match.threadId)),
            findForMessageMatch(match, messageSearch.query),
          );
        },
      },
    ];
  });
  // Rows already shown keep their places when a slower environment answers.
  const [shownOrder, setShownOrder] = useState<ShownOrder | null>(null);
  const order = nextShownOrder(
    shownOrder,
    messageSearch.query,
    rankedMessageItems.map((item) => item.value),
    PALETTE_MESSAGE_LIMIT,
  );
  if (order !== shownOrder) setShownOrder(order);
  const messageItemByValue = new Map(rankedMessageItems.map((item) => [item.value, item]));
  const threadMessageItems = order.keys
    .slice(0, order.shown)
    .flatMap((value) => messageItemByValue.get(value) ?? []);
  const spotlightItems: CommandPaletteActionItem[] = messageSearch.matches.map((match) => {
    const local = threadItems.find(
      (item) => item.value === `thread:${match.environmentId}:${match.threadId}`,
    );
    const target = scopeThreadRef(match.environmentId, match.threadId);
    const subtitle = [
      projectByKey.get(`${match.environmentId}:${match.projectId}`)?.title,
      match.archivedAt ? "\u5DF2\u5F52\u6863" : "",
      match.isSubagent ? "\u5B50\u4EFB\u52A1" : "",
      match.matchedQuery && match.matchedQuery !== messageSearch.query
        ? "\u8FD1\u4F3C\u5339\u914D"
        : "",
    ]
      .filter(Boolean)
      .join(" \u00B7 ");
    return {
      kind: "action",
      value: `thread:${match.environmentId}:${match.threadId}`,
      title: match.title ?? local?.title ?? match.threadId,
      searchTerms: [messageSearch.query, match.title ?? "", match.snippet],
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
        description: member.archivedAt ? "\u5DF2\u5F52\u6863" : "",
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
              query: match.matchedQuery ?? messageSearch.query,
            },
          }
        : {}),
      run: async () => {
        if (match.messageId)
          requestSpotlightMatch({
            thread: target,
            query: match.matchedQuery ?? messageSearch.query,
            messageId: match.messageId,
          });
        await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(target) });
      },
    };
  });
  const serverItemIds = new Set(
    messageSearch.matches.map((match) => `thread:${match.environmentId}:${match.threadId}`),
  );
  const threadItemsForSearch = [
    ...spotlightItems,
    ...threadItems.filter((item) => !serverItemIds.has(item.value)),
  ];
  const mainThreadIds = new Set(
    threads
      .filter((thread) => thread.lineage.relationshipToParent !== "subagent")
      .map((thread) => `thread:${thread.environmentId}:${thread.id}`),
  );
  const recentThreadItems = threadItems
    .filter((item) => mainThreadIds.has(item.value))
    .slice(0, RECENT_THREAD_LIMIT);
  return {
    threadItems,
    threadMessageItems,
    now,
    threadItemsForSearch,
    recentThreadItems,
    isSearchPending: messageSearch.isPending,
    searchError: messageSearch.error,
  };
}
