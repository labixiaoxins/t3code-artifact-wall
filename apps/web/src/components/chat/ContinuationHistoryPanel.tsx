import type { EnvironmentId, OrchestrationV2ThreadProjection, ThreadId } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { useNavigate } from "@tanstack/react-router";
import * as Option from "effect/Option";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useEnvironmentThread, threadEnvironment } from "../../state/threads";
import { useThreadShells, useProjects } from "../../state/entities";
import { useArchivedThreadSnapshots } from "../../lib/archivedThreadsState";
import { useThreadActions } from "../../hooks/useThreadActions";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useAtomCommand } from "../../state/use-atom-command";
import { useProjectFileQuery } from "../files/projectFilesQueryState";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  continuationHandoffPath,
  continuationMessages,
  continuationQuote,
} from "./continuationHistory";

export function ContinuationHistoryPanel(props: {
  environmentId: EnvironmentId;
  thread: EnvironmentThreadShell;
  projection: OrchestrationV2ThreadProjection | null;
  onQuote: (text: string) => boolean;
}) {
  const shells = useThreadShells();
  const parentId = props.thread.continuedFromThreadId;
  const parent =
    parentId != null
      ? shells.find((t) => t.environmentId === props.environmentId && t.id === parentId)
      : undefined;
  const children = shells.filter(
    (t) =>
      t.environmentId === props.environmentId &&
      t.continuedFromThreadId === props.thread.id &&
      t.deletedAt === null,
  );
  return (
    <>
      {parent ? (
        <OriginalThreadHistory
          key={`${props.environmentId}:${parent.id}`}
          {...props}
          parent={parent}
        />
      ) : parentId != null ? (
        <MissingOriginalCard environmentId={props.environmentId} threadId={parentId} />
      ) : null}
      {children.length > 0 ? (
        <section aria-label="后续会话" className="min-w-0 px-3 pt-3 pb-2">
          <h3 className="mb-2 text-xs font-medium">后续会话</h3>
          {children.map((child) => (
            <ThreadLink
              key={child.id}
              environmentId={props.environmentId}
              threadId={child.id}
              title={child.title}
            />
          ))}
        </section>
      ) : null}
    </>
  );
}

/**
 * Archived threads are not in the live shell list and their route redirects home, so the
 * card offers to unarchive first; a deleted original is stated plainly with no dead link.
 */
function MissingOriginalCard({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const environmentIds = useMemo(() => [environmentId], [environmentId]);
  const archived = useArchivedThreadSnapshots(environmentIds);
  const { unarchiveThread } = useThreadActions();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const original = archived.snapshots
    .find((entry) => entry.environmentId === environmentId)
    ?.snapshot.threads.find((thread) => thread.id === threadId);
  return (
    <section aria-label="原会话" className="min-w-0 px-3 pt-3 pb-2" data-continuation-history>
      <h3 className="mb-1 text-xs font-medium">原会话</h3>
      {original ? (
        <>
          <p className="mb-1 text-xs text-muted-foreground">《{original.title}》已归档。</p>
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setFailed(false);
              void unarchiveThread(scopeThreadRef(environmentId, threadId)).then((result) => {
                setBusy(false);
                if (result._tag !== "Success") {
                  setFailed(true);
                  return;
                }
                void navigate({
                  to: "/$environmentId/$threadId",
                  params: { environmentId, threadId },
                });
              });
            }}
          >
            取消归档并打开
          </Button>
          {failed ? <p className="text-xs text-destructive">取消归档失败，请重试。</p> : null}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {archived.isLoading ? "正在查找原会话…" : "原会话已删除，无法打开。"}
        </p>
      )}
    </section>
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
}: {
  environmentId: EnvironmentId;
  parent: EnvironmentThreadShell;
  projection: OrchestrationV2ThreadProjection | null;
  onQuote: (text: string) => boolean;
}) {
  // The existing thread state loads a bounded window and holds an opaque history cursor.
  // No visit/settle/approval/message command is dispatched for the source thread.
  const state = useEnvironmentThread(environmentId, parent.id);
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
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const [fileOpen, setFileOpen] = useState(false);
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
    if (busy.current || state.history.loading || !state.history.hasMoreHistory) return;
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
      <h3 className="mb-1 text-xs font-medium">原会话</h3>
      <p className="break-words text-xs">{parent.title}</p>
      <p className="mt-1 text-2xs text-muted-foreground">
        {new Date(parent.createdAt).toLocaleString()} · {parent.itemCount} 条
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
                disabled={state.history.loading}
                onClick={() => {
                  void earlier();
                }}
              >
                {state.history.loading ? "正在加载…" : "继续加载更早记录"}
              </Button>
            ) : null}
            {state.history.error ? (
              <p role="alert" className="text-xs">
                {state.history.error}
              </p>
            ) : null}
            {!original ? (
              <p className="text-xs">
                {Option.isSome(state.error)
                  ? "原会话读取失败，请重新打开面板重试"
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
      <div className="mt-2">
        <ThreadLink environmentId={environmentId} threadId={parent.id} title="在主区打开" />
      </div>
    </section>
  );
}
