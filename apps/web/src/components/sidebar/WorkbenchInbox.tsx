import { useAtomValue } from "@effect/atom-react";
import { primaryServerKeybindingsAtom } from "../../state/server";
import { resolveShortcutCommand, shortcutLabelForCommand } from "../../keybindings";
import { isTerminalFocused } from "../../lib/terminalFocus";
import { isEditableFocused } from "../../lib/editableFocus";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { isModelPickerOpen } from "../../modelPickerVisibility";
import { sidebarProviderLabel } from "../../sidebarProviderGrouping";
import { InboxStatusMark } from "./InboxStatusMark";
import { useEffect, useId, useMemo, useState } from "react";
import { BookmarkIcon, InboxIcon, HistoryIcon, XIcon } from "lucide-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { SidebarThreadSummary } from "../../types";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useAllEnvironmentShellsBootstrapped } from "../../state/entities";
import { useEnvironments } from "../../state/environments";
import { useUiStateStore } from "../../uiStateStore";
import { inboxReason, inboxThreadKey, resumableThreads, resumeVisits } from "../../workbenchInbox";
import { useWorkbenchInboxStore } from "../../workbenchInboxStore";
import {
  nextAttentionThread,
  attentionThreadLabel,
  attentionPage,
  attentionTimestamp,
  sortedAttentionThreads,
  sidebarRelativeTime,
} from "../../sidebarInboxPresentation";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { isAtomCommandInterrupted } from "@t3tools/client-runtime/state/runtime";
import { Button } from "../ui/button";
import { Popover, PopoverTrigger, PopoverPopup, PopoverTitle, PopoverClose } from "../ui/popover";
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from "../ui/sidebar";

export function WorkbenchInbox({
  threads,
  projects,
  activeKey,
  navigate,
}: {
  threads: readonly SidebarThreadSummary[];
  projects: readonly SidebarProjectSnapshot[];
  activeKey: string | null;
  navigate: (ref: ScopedThreadRef) => void;
}) {
  const inboxId = useId();
  const keybindings = useAtomValue(primaryServerKeybindingsAtom);
  const nextShortcut = shortcutLabelForCommand(keybindings, "inbox.next");
  const [view, setView] = useState<"resume" | null>(null);
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem("t3code:inbox-expanded") !== "false";
    } catch {
      return true;
    }
  });
  const [showAll, setShowAll] = useState(false);
  const visitThread = useAtomCommand(threadEnvironment.visit, { reportFailure: false });
  const [storageError, setStorageError] = useState(false);
  const { saved, visits, acknowledgedErrors, update } = useWorkbenchInboxStore();
  const localVisits = useUiStateStore((state) => state.threadLastVisitedAtById);
  const { environments, isReady } = useEnvironments();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const incomplete =
    !bootstrapped ||
    !isReady ||
    environments.length === 0 ||
    environments.some((environment) => environment.connection.phase !== "connected");
  useEffect(() => {
    if (activeKey) setStorageError(!update("visits", activeKey, new Date().toISOString()));
  }, [activeKey, update]);
  const projectByThread = useMemo(() => {
    const result = new Map<string, SidebarProjectSnapshot>();
    for (const project of projects)
      for (const key of project.providerThreadKeys ?? []) result.set(key, project);
    return result;
  }, [projects]);
  const reasons = useMemo(
    () =>
      new Map(
        threads.map((thread) => [
          inboxThreadKey(thread),
          inboxReason(thread, localVisits[inboxThreadKey(thread)]),
        ]),
      ),
    [threads, localVisits],
  );
  const actionable = threads.filter((thread) =>
    ["待授权", "待回答"].includes(reasons.get(inboxThreadKey(thread)) ?? ""),
  );
  const errors = threads.filter(
    (thread) =>
      reasons.get(inboxThreadKey(thread)) === "运行失败" &&
      acknowledgedErrors[inboxThreadKey(thread)] !== thread.latestRun?.runId,
  );
  const attention = useMemo(
    () => sortedAttentionThreads(threads, acknowledgedErrors, localVisits),
    [threads, acknowledgedErrors, localVisits],
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || isCommandPaletteOpen() || isModelPickerOpen())
        return;
      const command = resolveShortcutCommand(event, keybindings, {
        context: {
          terminalFocus: isTerminalFocused(),
          editableFocus: isEditableFocused(event.target),
        },
      });
      if (command !== "inbox.next") return;
      const target = nextAttentionThread(attention, activeKey);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      navigate(scopeThreadRef(target.environmentId, target.id));
    };
    // Handle inbox navigation before rich-text keymaps consume shifted Mod-I.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [attention, activeKey, keybindings, navigate]);
  const page = attentionPage(attention, showAll);
  const markSeen = async (thread: SidebarThreadSummary) => {
    const visitedAt = new Date().toISOString();
    const result = await visitThread({
      environmentId: thread.environmentId,
      input: { threadId: thread.id, visitedAt },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) setStorageError(true);
      return;
    }
    useUiStateStore.getState().markThreadVisited(inboxThreadKey(thread), visitedAt);
    setStorageError(!update("visits", inboxThreadKey(thread), visitedAt));
  };
  const visitHistory = useMemo(
    () => resumeVisits(threads, localVisits, visits),
    [threads, localVisits, visits],
  );
  const recent = useMemo(
    () => resumableThreads(threads, visitHistory, saved),
    [threads, visitHistory, saved],
  );
  const current = threads.find((thread) => inboxThreadKey(thread) === activeKey);
  const change = (
    field: "saved" | "acknowledgedErrors",
    thread: SidebarThreadSummary,
    value: string | null,
  ) => setStorageError(!update(field, inboxThreadKey(thread), value));
  const renderRows = (items: readonly SidebarThreadSummary[]) =>
    items.map((thread) => {
      const key = inboxThreadKey(thread);
      const project = projectByThread.get(key);
      const isSaved = Boolean(saved[key]);
      return (
        <li key={key} className="flex items-start gap-1 rounded-md p-1 hover:bg-accent/50">
          <button
            type="button"
            className="min-w-0 flex-1 rounded-md p-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            onClick={() => {
              navigate(scopeThreadRef(thread.environmentId, thread.id));
              setView(null);
            }}
          >
            <span className="block break-words text-sm font-medium">
              {thread.title || "未命名会话"}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {project?.displayName ?? "项目"} ·{" "}
              {project?.providerLabel ?? thread.modelSelection.instanceId}
              {thread.lineage.relationshipToParent === "subagent" ? " · 子任务" : ""}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {isSaved ? "留待继续" : "最近访问"} ·{" "}
              {sidebarRelativeTime(visitHistory[key] ?? saved[key] ?? thread.updatedAt)}
            </span>
          </button>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Button
              size="icon"
              variant={isSaved ? "secondary" : "ghost"}
              aria-label={isSaved ? "取消留待继续" : "留待继续"}
              aria-pressed={isSaved}
              title={isSaved ? "取消留待继续" : "留待继续"}
              onClick={() => change("saved", thread, isSaved ? null : new Date().toISOString())}
            >
              <BookmarkIcon />
            </Button>
          </div>
        </li>
      );
    });
  const section = (title: string, items: readonly SidebarThreadSummary[], empty: string) => (
    <section className="space-y-1">
      <h3 className="text-sm font-medium">
        {title} <span className="text-muted-foreground">{items.length}</span>
      </h3>
      {items.length ? (
        <ul className="space-y-1">{renderRows(items)}</ul>
      ) : (
        <p className="text-xs text-muted-foreground">{empty}</p>
      )}
    </section>
  );
  const panel = (
    <PopoverPopup
      side="right"
      align="start"
      sideOffset={12}
      width="lg"
      padding="compact"
      collisionPadding={{ top: 56, right: 12, bottom: 12, left: 12 }}
    >
      <div className="mb-3 border-b px-1 pb-3 pt-1">
        <div className="flex items-center justify-between gap-2">
          <PopoverTitle>继续上次</PopoverTitle>
          <PopoverClose render={<Button variant="ghost" size="icon" aria-label="关闭面板" />}>
            <XIcon />
          </PopoverClose>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">找回最近访问或留待继续的会话。</p>
      </div>
      <div className="max-h-[min(65vh,640px)] space-y-4 overflow-y-auto px-1 pb-2">
        {incomplete ? (
          <p role="status" className="rounded-md border p-3 text-sm">
            部分连接尚未就绪，以下可能是上次同步的记录；数量不代表全部。
          </p>
        ) : null}
        {storageError ? (
          <p role="alert" className="text-sm text-destructive">
            本机记录保存失败，请检查浏览器存储空间后重试。
          </p>
        ) : null}

        <>
          {current ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                change(
                  "saved",
                  current,
                  saved[inboxThreadKey(current)] ? null : new Date().toISOString(),
                )
              }
            >
              {saved[inboxThreadKey(current)] ? "取消当前会话的留存" : "把当前会话留待继续"}
            </Button>
          ) : null}
          {section(
            "留待继续",
            recent.filter((thread) => saved[inboxThreadKey(thread)]),
            "用书签保留暂时放下的任务，可随时取消。",
          )}
          {section(
            "最近访问",
            recent.filter((thread) => !saved[inboxThreadKey(thread)]).slice(0, 20),
            "打开会话后会记录在这里。",
          )}
          <p className="text-xs text-muted-foreground">
            留存和访问记录保存在本机，不会改变任务完成状态。
          </p>
        </>
      </div>
    </PopoverPopup>
  );
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          aria-expanded={expanded}
          aria-controls={`${inboxId}-attention`}
          title={nextShortcut ? `下一条待我处理 (${nextShortcut})` : "待我处理"}
          onClick={() => {
            const next = !expanded;
            try {
              localStorage.setItem("t3code:inbox-expanded", String(next));
              setExpanded(next);
            } catch {
              setStorageError(true);
            }
          }}
        >
          <InboxIcon />
          <span className="flex-1">待我处理</span>
          <span
            className={`text-xs tabular-nums ${actionable.length + errors.length ? "text-primary" : "text-muted-foreground"}`}
          >
            {actionable.length + errors.length}
          </span>
        </SidebarMenuButton>
        {(expanded && attention.length > 0) || incomplete || storageError ? (
          <div id={`${inboxId}-attention`} className="ml-4 border-l border-sidebar-border pl-2">
            {incomplete ? (
              <p role="status" className="py-1 text-xs text-muted-foreground">
                部分连接尚未就绪，以下可能是上次同步的记录；数量不代表全部。
              </p>
            ) : null}
            {storageError ? (
              <p role="alert" className="py-1 text-xs text-destructive">
                本机记录保存失败，请检查浏览器存储空间后重试。
              </p>
            ) : null}
            {expanded && attention.length ? (
              <>
                <ul className="max-h-64 overflow-y-auto" aria-label="待我处理会话">
                  {page.rows.map((thread) => {
                    const key = inboxThreadKey(thread),
                      reason = reasons.get(key);
                    const label = attentionThreadLabel(thread, threads, reason ?? null);
                    const project = projectByThread.get(key);
                    const provider =
                      project?.providerLabel ??
                      sidebarProviderLabel(thread.modelSelection.instanceId);
                    return (
                      <li
                        key={key}
                        data-inbox-thread={thread.id}
                        className="group/inbox flex min-w-0 items-center gap-1 rounded-md p-1 hover:bg-accent/50 focus-within:bg-accent/50"
                      >
                        {reason ? <InboxStatusMark reason={reason} /> : null}
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                          onClick={() => navigate(scopeThreadRef(thread.environmentId, thread.id))}
                        >
                          <span className="block truncate text-sm" title={label.title}>
                            {label.title}
                          </span>
                          <span
                            className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground"
                            title={
                              label.detail ??
                              `${project?.displayName ?? "项目"} · ${provider} · ${reason}`
                            }
                          >
                            {label.detail ? (
                              <span className="min-w-0 truncate">{label.detail}</span>
                            ) : (
                              <>
                                <span className="min-w-0 shrink truncate">
                                  {project?.displayName ?? "项目"}
                                </span>
                                <span className="shrink-0">·</span>
                                <span className="shrink-0">{provider}</span>
                                <span className="shrink-0">·</span>
                                <span className="shrink-0">{reason}</span>
                              </>
                            )}
                          </span>
                        </button>
                        <div className="shrink-0 text-xs">
                          <span className="text-muted-foreground group-hover/inbox:hidden group-focus-within/inbox:hidden">
                            {sidebarRelativeTime(attentionTimestamp(thread))}
                          </span>
                          <div className="hidden items-center group-hover/inbox:flex group-focus-within/inbox:flex">
                            {reason === "运行失败" ? (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() =>
                                  change(
                                    "acknowledgedErrors",
                                    thread,
                                    thread.latestRun?.runId ?? null,
                                  )
                                }
                              >
                                已知悉
                              </Button>
                            ) : null}
                            {reason === "有新结果" ? (
                              <Button
                                size="xs"
                                variant="ghost"
                                onClick={() => void markSeen(thread)}
                              >
                                已看
                              </Button>
                            ) : null}
                            <Button
                              size="xs"
                              variant="ghost"
                              aria-pressed={Boolean(saved[key])}
                              onClick={() =>
                                change(
                                  "saved",
                                  thread,
                                  saved[key] ? null : new Date().toISOString(),
                                )
                              }
                            >
                              {saved[key] ? "取消稍后" : "稍后"}
                            </Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {attention.length > 5 ? (
                  <Button size="xs" variant="ghost" onClick={() => setShowAll(!showAll)}>
                    {showAll ? "收起" : `更多 ${page.hidden}`}
                  </Button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </SidebarMenuItem>
      <SidebarMenuItem>
        <Popover open={view === "resume"} onOpenChange={(open) => setView(open ? "resume" : null)}>
          <PopoverTrigger
            id={`${inboxId}-resume`}
            render={<SidebarMenuButton isActive={view === "resume"} />}
          >
            <HistoryIcon />
            <span className="flex-1">继续上次</span>
            {recent.some((thread) => saved[inboxThreadKey(thread)]) ? (
              <span className="text-xs text-muted-foreground">
                已留存 {recent.filter((thread) => saved[inboxThreadKey(thread)]).length}
              </span>
            ) : null}
          </PopoverTrigger>
          {panel}
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
