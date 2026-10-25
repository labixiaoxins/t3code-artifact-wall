import { readUiLocale } from "~/i18n";
import type { EnvironmentId, OrchestrationV2ThreadProjection, ThreadId } from "@t3tools/contracts";
import {
  presentThreadShell,
  type EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";
import { useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEnvironmentThread, threadEnvironment } from "../../state/threads";
import { useThreadShells, useProjects } from "../../state/entities";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { environmentCatalog } from "../../connection/catalog";
import { ArchiveOriginalThreadButton } from "./ArchiveOriginalThreadButton";
import { useAtomCommand } from "../../state/use-atom-command";
import { useProjectFileQuery } from "../files/projectFilesQueryState";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  buildContinuationChain,
  isContinuationSegment,
  continuationHandoffPath,
  continuationMessages,
  continuationQuote,
} from "./continuationHistory";

export function ContinuationHistoryPanel(props: {
  environmentId: EnvironmentId;
  thread: EnvironmentThreadShell;
  projection: OrchestrationV2ThreadProjection | null;
  onQuote: (text: string) => boolean;
  /** Shown instead of nothing when this thread has no earlier or later segments. */
  emptyLabel?: string;
}) {
  const shells = useThreadShells();
  const environmentIds = useMemo(() => [props.environmentId], [props.environmentId]);
  const archived = useArchivedThreadSnapshots(environmentIds);
  const connection = useAtomValue(environmentCatalog.stateAtom(props.environmentId));
  const phase = Option.getOrNull(AsyncResult.value(connection))?.phase;
  const disconnected = phase !== undefined && phase !== "connected";
  const archivedShells = useMemo(
    () =>
      archived.snapshots.flatMap((entry) =>
        entry.snapshot.threads.map((thread) => presentThreadShell(entry.environmentId, thread)),
      ),
    [archived.snapshots],
  );
  const threads = useMemo(() => {
    const merged = new Map<ThreadId, EnvironmentThreadShell>();
    for (const thread of archivedShells) merged.set(thread.id, thread);
    for (const thread of shells) {
      if (thread.environmentId === props.environmentId) merged.set(thread.id, thread);
    }
    merged.set(props.thread.id, props.thread);
    return [...merged.values()];
  }, [archivedShells, shells, props.environmentId, props.thread]);
  const chain = buildContinuationChain(props.thread, threads);
  const children = threads.filter(
    (thread) =>
      thread.id !== props.thread.id &&
      isContinuationSegment(thread) &&
      thread.continuedFromThreadId === props.thread.id &&
      thread.deletedAt === null,
  );
  if (
    !isContinuationSegment(props.thread) ||
    (!props.thread.continuedFromThreadId && children.length === 0)
  )
    return props.emptyLabel ? (
      <p className="px-3 py-3 text-xs text-muted-foreground">{props.emptyLabel}</p>
    ) : null;
  return (
    <>
      <section aria-label="续聊段序" className="min-w-0 px-3 pt-3 pb-2" data-continuation-history>
        <h3 className="mb-2 text-xs font-medium">续聊历史</h3>
        {disconnected ? (
          <p role="status" className="text-xs">
            连接已断开，当前显示缓存记录；恢复连接后可继续读取。
          </p>
        ) : null}
        {chain.issue === "cycle" ? (
          <p role="alert" className="text-xs">
            续聊关系存在循环，已停止追溯。
          </p>
        ) : null}
        {chain.issue === "broken" ? (
          <div className="text-xs" role="status">
            {disconnected
              ? "暂时无法核实更早的会话。"
              : archived.isLoading
                ? "正在查找更早的会话…"
                : archived.error
                  ? "续聊历史加载失败，请重试。"
                  : "续聊链已断开：更早的会话不存在或不属于续聊。"}
            {!disconnected && archived.error ? (
              <Button size="xs" variant="ghost" onClick={archived.refresh}>
                重试加载段序
              </Button>
            ) : null}
          </div>
        ) : null}
        {chain.segments.map((segment, index) => (
          <div key={segment.id} className="my-2 border-l pl-2">
            <p className="text-xs font-medium">
              {chain.issue === null ? `第 ${index + 1} 段` : "已找到的段落"}
              {segment.id === props.thread.id ? " · 当前段" : ""}
              {segment.archivedAt != null ? " · 已归档" : " · 未归档"}
            </p>
            {segment.id === props.thread.id ? (
              <>
                <p className="break-words text-xs">{segment.title}</p>
                <p className="text-2xs text-muted-foreground">
                  {new Date(segment.createdAt).toLocaleString(readUiLocale())}
                </p>
              </>
            ) : (
              <OriginalThreadHistory
                {...props}
                parent={segment}
                disconnected={disconnected}
                projection={
                  segment.id === props.thread.continuedFromThreadId ? props.projection : null
                }
              />
            )}
          </div>
        ))}
      </section>
      {children.length > 0 ? (
        <section aria-label="后续会话" className="min-w-0 px-3 pt-3 pb-2">
          <h3 className="mb-2 text-xs font-medium">后续会话</h3>
          {children.map((child) =>
            child.archivedAt != null ? (
              <div key={child.id}>
                <p className="text-2xs text-muted-foreground">已归档</p>
                <OriginalThreadHistory
                  {...props}
                  parent={child}
                  projection={null}
                  disconnected={disconnected}
                />
              </div>
            ) : (
              <ThreadLink
                key={child.id}
                environmentId={props.environmentId}
                threadId={child.id}
                title={child.title}
              />
            ),
          )}
        </section>
      ) : null}
    </>
  );
}

function ThreadLink({
  environmentId,
  threadId,
  title,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  title: string;
}) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() => {
        void navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId } });
      }}
    >
      {title} →
    </Button>
  );
}

function OriginalThreadHistory({
  environmentId,
  parent,
  projection,
  onQuote,
  disconnected,
}: {
  environmentId: EnvironmentId;
  parent: EnvironmentThreadShell;
  disconnected: boolean;
  projection: OrchestrationV2ThreadProjection | null;
  onQuote: (text: string) => boolean;
}) {
  // The existing thread state loads a bounded window and holds an opaque history cursor.
  // No visit/settle/approval/message command is dispatched for the source thread.
  const [expanded, setExpanded] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  // Mount the existing bounded, read-only subscription only on explicit inspection.
  const state = useEnvironmentThread(
    expanded || fileOpen ? environmentId : null,
    expanded || fileOpen ? parent.id : null,
  );
  const original = Option.getOrNull(state.data);
  const loadEarlier = useAtomCommand(threadEnvironment.loadEarlierHistory, {
    reportFailure: false,
  });
  const projects = useProjects();
  const cwd =
    parent.worktreePath ??
    projects.find((p) => p.environmentId === environmentId && p.id === parent.projectId)
      ?.workspaceRoot ??
    "";
  const [query, setQuery] = useState("");
  const [quoteError, setQuoteError] = useState(false);
  const path = continuationHandoffPath(
    projection?.messages.find((m) => m.role === "user")?.text,
    original?.messages.toReversed().find((m) => m.role === "assistant")?.text,
  );
  const file = useProjectFileQuery(
    environmentId,
    cwd,
    path,
    fileOpen && path !== null && cwd !== "",
  );
  const messages = useMemo(
    () => continuationMessages(original?.visibleTurnItems ?? [], query),
    [original?.visibleTurnItems, query],
  );
  const scroller = useRef<HTMLDivElement | null>(null);
  const scrollAnchor = useRef<{ height: number; top: number } | null>(null);
  const busy = useRef(false);
  const didScrollToEnd = useRef(false);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !expanded) return;
    if (scrollAnchor.current) {
      el.scrollTop = scrollAnchor.current.top + el.scrollHeight - scrollAnchor.current.height;
      scrollAnchor.current = null;
    } else if (!didScrollToEnd.current && original) {
      el.scrollTop = el.scrollHeight;
      didScrollToEnd.current = true;
    }
  }, [expanded, original]);
  const earlier = async () => {
    if (disconnected || busy.current || state.history.loading || !state.history.hasMoreHistory)
      return;
    busy.current = true;
    const el = scroller.current;
    if (el) scrollAnchor.current = { height: el.scrollHeight, top: el.scrollTop };
    try {
      await loadEarlier({ environmentId, input: { threadId: parent.id } });
    } finally {
      busy.current = false;
    }
  };
  return (
    <section aria-label="原会话" className="min-w-0 px-3 pt-3 pb-2" data-continuation-history>
      <p className="break-words text-xs">{parent.title}</p>
      <p className="mt-1 text-2xs text-muted-foreground">
        {new Date(parent.createdAt).toLocaleString(readUiLocale())} · {parent.itemCount} 条
      </p>
      <div className="my-2 flex flex-wrap gap-1">
        <Button
          size="xs"
          variant="secondary"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
            didScrollToEnd.current = false;
          }}
        >
          {" "}
          {expanded ? "收起记录" : "查看记录"}{" "}
        </Button>
        {parent.archivedAt == null ? (
          <ArchiveOriginalThreadButton
            environmentId={environmentId}
            threadId={parent.id}
            disconnected={disconnected}
          />
        ) : null}
        {path ? (
          <Button size="xs" variant="ghost" onClick={() => setFileOpen(!fileOpen)}>
            {fileOpen ? "收起交接文件" : "打开交接文件"}
          </Button>
        ) : null}
      </div>
      {fileOpen ? (
        <div className="mb-2 rounded-lg border p-2" data-continuation-file>
          <p className="mb-1 break-all text-2xs text-muted-foreground">{path}</p>
          {file.isPending ? (
            <p className="text-xs">正在读取交接文件…</p>
          ) : file.error ? (
            <>
              <p role="alert" className="text-xs">
                {file.error}
              </p>
              <Button size="xs" variant="ghost" onClick={file.refresh}>
                重试
              </Button>
            </>
          ) : (
            <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-words text-xs">
              {file.data?.contents}
            </pre>
          )}
          {file.data?.truncated ? <p className="text-xs">文件内容已截断</p> : null}
        </div>
      ) : null}
      {expanded ? (
        <>
          <p className="mb-2 text-2xs text-muted-foreground">
            只读记录；引用仅加入当前输入框，由你确认发送。
          </p>
          <Input
            aria-label="搜索原会话记录"
            placeholder="搜索已加载记录"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="my-1 text-2xs text-muted-foreground">
            {messages.length} 条匹配 · 搜索已加载记录
            {state.history.hasMoreHistory ? "，可继续加载更早记录" : "，全部已加载"}
          </p>
          {quoteError ? (
            <p role="alert" className="text-xs">
              当前输入框暂不可引用，请关闭面板检查连接或待处理请求后重试。
            </p>
          ) : null}
          <div
            ref={scroller}
            data-original-timeline
            className="max-h-[45dvh] overflow-y-auto overscroll-contain"
            onScroll={(event) => {
              if (event.currentTarget.scrollTop < 32 && !query) void earlier();
            }}
          >
            {state.history.hasMoreHistory ? (
              <Button
                size="xs"
                variant="ghost"
                disabled={disconnected || state.history.loading}
                onClick={() => {
                  void earlier();
                }}
              >
                {state.history.loading ? "正在加载…" : "继续加载更早记录"}
              </Button>
            ) : null}
            {state.history.error ? (
              <p role="alert" className="text-xs">
                更早记录加载失败，请重试。
              </p>
            ) : null}
            {!original ? (
              <p className="text-xs">
                {disconnected
                  ? "连接已断开，等待重新连接。"
                  : state.status === "deleted"
                    ? "原会话已删除，无法读取正文。"
                    : Option.isSome(state.error)
                      ? "原会话读取失败，请收起后重新展开重试。"
                      : "正在读取原会话…"}
              </p>
            ) : messages.length === 0 ? (
              <p className="py-2 text-xs">没有匹配消息</p>
            ) : null}
            {messages.map(({ item }) =>
              item.type === "user_message" || item.type === "assistant_message" ? (
                <article
                  key={item.id}
                  className="group my-2 rounded-lg border p-2"
                  data-original-message={item.id}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-2xs text-muted-foreground">
                      {item.type === "user_message" ? "用户" : "助手"}
                    </span>
                    <div className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100 max-md:opacity-100">
                      <Button
                        size="xs"
                        variant="ghost"
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() =>
                          setQuoteError(
                            !onQuote(
                              continuationQuote(item.text, parent.title, {
                                threadId: parent.id,
                                itemId: item.id,
                              }),
                            ),
                          )
                        }
                      >
                        引用
                      </Button>
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-xs select-text">{item.text}</p>
                </article>
              ) : null,
            )}
          </div>
        </>
      ) : null}
      {parent.archivedAt == null ? (
        <div className="mt-2">
          <ThreadLink environmentId={environmentId} threadId={parent.id} title="在主区打开" />
        </div>
      ) : null}
    </section>
  );
}
