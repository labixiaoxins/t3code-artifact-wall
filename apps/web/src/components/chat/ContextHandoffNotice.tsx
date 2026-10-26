import { uiText } from "~/i18n";
import { latestContextUsage } from "./contextUsage";
import type { EnvironmentId, OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { CommandId, MessageId, ThreadId } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverTrigger, PopoverPopup, PopoverTitle } from "../ui/popover";
import { ChevronDownIcon, CircleAlertIcon } from "lucide-react";
import { TurnThroughput } from "./TurnThroughputStatus";
import { useProjectFileQuery } from "../files/projectFilesQueryState";
import { useThreadHandoffSummary, useThreadShell } from "../../state/entities";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { newMessageId, newThreadId } from "../../lib/utils";
import {
  buildHandoffInstruction,
  contextRatio,
  continuationParameters,
  expectedHandoffPath,
  hasHandoffBudgetFailure,
  longConversationLevel,
  parseHandoffPath,
} from "./contextHandoff";

interface HandoffState {
  requestMessageId?: string;
  /** Exact file the instruction asked for; checked even when the reply line is malformed. */
  expectedPath?: string;
  nextThreadId?: string;
  /** Set only after the new thread received its first message, so a failed start can retry. */
  startedNextThreadId?: string;
}
function readState(key: string): HandoffState {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (typeof value !== "object" || value === null) return {};
    const state = value as HandoffState;
    return {
      ...(typeof state.requestMessageId === "string"
        ? { requestMessageId: state.requestMessageId }
        : {}),
      ...(typeof state.expectedPath === "string" ? { expectedPath: state.expectedPath } : {}),
      ...(typeof state.nextThreadId === "string" ? { nextThreadId: state.nextThreadId } : {}),
      ...(typeof state.startedNextThreadId === "string"
        ? { startedNextThreadId: state.startedNextThreadId }
        : {}),
    };
  } catch {
    return {};
  }
}

/** Keyed by environment/thread in ChatView so in-flight state cannot leak across navigation. */
export function ContextHandoffNotice({
  environmentId,
  thread,
  projection,
  cwd,
  enabled,
  disabled,
  onCompact,
  compactDisabled = false,
  showThroughput = false,
  disconnected = false,
}: {
  environmentId: EnvironmentId;
  thread: EnvironmentThreadShell;
  projection: OrchestrationV2ThreadProjection;
  cwd: string;
  enabled: boolean;
  disabled: boolean;
  onCompact?: (() => void) | undefined;
  compactDisabled?: boolean;
  showThroughput?: boolean;
  disconnected?: boolean;
}) {
  const key = `t3-context-handoff:${environmentId}:${thread.id}`;
  const [state, setState] = useState(() => readState(key));
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(`${key}:dismissed`) === "true";
    } catch {
      return false;
    }
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { pendingSubtasks, nextThreadId } = useThreadHandoffSummary(
    scopeThreadRef(environmentId, thread.id),
  );
  const [pendingNavigationId, setPendingNavigationId] = useState<ThreadId | null>(null);
  const pendingNavigationShell = useThreadShell(
    pendingNavigationId === null ? null : scopeThreadRef(environmentId, pendingNavigationId),
  );
  useEffect(() => {
    // A command receipt can precede the live shell update. Navigating before
    // the shell arrives makes ThreadRouteView treat the new thread as missing.
    if (pendingNavigationId === null || pendingNavigationShell === null) return;
    void navigate({
      to: "/$environmentId/$threadId",
      params: { environmentId, threadId: pendingNavigationId },
    });
  }, [environmentId, navigate, pendingNavigationId, pendingNavigationShell]);
  const create = useAtomCommand(threadEnvironment.create, { reportFailure: false });
  const start = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const settle = useAtomCommand(threadEnvironment.settle, { reportFailure: false });
  const save = (next: HandoffState) => {
    setState(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* In-memory flow still works when storage is unavailable. */
    }
  };
  const nextThread = nextThreadId === null ? null : { id: nextThreadId };
  // Promote-to-steer cancels the queued run and injects the message into the active one,
  // so the message's own runId is authoritative when present.
  const requestRunId =
    state.requestMessageId === undefined
      ? null
      : (projection.messages.find((message) => message.id === state.requestMessageId)?.runId ??
        null);
  const pendingRun =
    state.requestMessageId === undefined
      ? null
      : (projection.runs.find((run) => requestRunId !== null && run.id === requestRunId) ??
        projection.runs.find((run) => run.userMessageId === state.requestMessageId));
  const active = projection.runs.some((run) =>
    ["preparing", "starting", "running", "waiting", "queued"].includes(run.status),
  );
  const budgetBlocked = !active && hasHandoffBudgetFailure(projection);
  const pending =
    !budgetBlocked &&
    state.requestMessageId !== undefined &&
    (!pendingRun ||
      !["completed", "interrupted", "failed", "cancelled", "rolled_back"].includes(
        pendingRun.status,
      ));
  const lastAssistant = projection.messages
    .toReversed()
    .find(
      (message) =>
        message.role === "assistant" &&
        (state.requestMessageId === undefined || message.runId === pendingRun?.id),
    );
  const settledReply =
    thread.lineage.relationshipToParent !== "subagent" &&
    ((enabled && !dismissed) || state.requestMessageId !== undefined) &&
    !active &&
    !pending;
  const requested = state.requestMessageId !== undefined;
  const replyPath =
    settledReply && lastAssistant && !lastAssistant.streaming
      ? parseHandoffPath(lastAssistant.text, { strict: !requested })
      : null;
  // After a request the client-chosen file is authoritative; the reply line is only a
  // fallback for an agent that wrote somewhere else.
  const expectedPath = settledReply && requested ? (state.expectedPath ?? null) : null;
  const expectedFile = useProjectFileQuery(environmentId, cwd, expectedPath, expectedPath !== null);
  const expectedFound =
    expectedPath !== null &&
    expectedFile.data !== null &&
    expectedFile.error === null &&
    !expectedFile.isPending;
  const fallbackPath =
    replyPath !== null && replyPath !== expectedPath && !expectedFound ? replyPath : null;
  const replyFile = useProjectFileQuery(environmentId, cwd, fallbackPath, fallbackPath !== null);
  const replyFound =
    fallbackPath !== null &&
    replyFile.data !== null &&
    replyFile.error === null &&
    !replyFile.isPending;
  const handoffPath = expectedFound
    ? expectedPath
    : replyFound
      ? fallbackPath
      : (expectedPath ?? replyPath);
  const file = {
    isPending:
      (expectedPath !== null && expectedFile.isPending) ||
      (fallbackPath !== null && replyFile.isPending),
    refresh: () => {
      expectedFile.refresh();
      replyFile.refresh();
    },
  };
  const ready = expectedFound || replyFound;
  const usage = latestContextUsage({ ...projection, thread });
  const ratio = contextRatio(usage);
  const turns = projection.runs.reduce((max, run) => Math.max(max, run.ordinal), 0);
  const level = longConversationLevel({
    enabled,
    dismissed,
    relationshipToParent: thread.lineage.relationshipToParent,
    items: thread.itemCount,
    turns,
    ratio,
    usedTokens: usage?.usedTokens ?? null,
  });
  const missing =
    !pending &&
    !active &&
    (state.requestMessageId !== undefined || handoffPath !== null) &&
    !ready &&
    !file.isPending;
  const openThread = (id: ThreadId) =>
    navigate({ to: "/$environmentId/$threadId", params: { environmentId, threadId: id } });
  const runAction = async (action: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "交接失败，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const requireSuccess = (result: Awaited<ReturnType<typeof start>>) => {
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  };
  const requestHandoff = () =>
    runAction(async () => {
      const messageId = newMessageId();
      const expectedPath = expectedHandoffPath(cwd, thread.id);
      requireSuccess(
        await start({
          environmentId,
          input: {
            threadId: thread.id,
            message: {
              messageId,
              role: "user",
              text: buildHandoffInstruction(expectedPath, pendingSubtasks),
              attachments: [],
            },
            modelSelection: thread.modelSelection,
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
            dispatchMode: "queue",
            createdAt: new Date().toISOString(),
          },
        }),
      );
      save({ requestMessageId: messageId, expectedPath });
    });
  const continueThread = (path: string | null) =>
    runAction(async () => {
      const id = state.nextThreadId ? ThreadId.make(state.nextThreadId) : newThreadId();
      save({ ...state, nextThreadId: id });
      const parameters = continuationParameters(thread, id, path);
      // Stable receipt IDs make retries after a lost response reuse the accepted operations.
      requireSuccess(
        await create({
          environmentId,
          input: {
            ...parameters.create,
            commandId: CommandId.make(`context-handoff:create:${id}`),
            createdAt: new Date().toISOString(),
          },
        }),
      );
      requireSuccess(
        await start({
          environmentId,
          input: {
            threadId: id,
            commandId: CommandId.make(`context-handoff:start:${id}`),
            message: {
              messageId: MessageId.make(`context-handoff:message:${id}`),
              role: "user",
              text: parameters.prompt,
              attachments: [],
            },
            modelSelection: thread.modelSelection,
            runtimeMode: thread.runtimeMode,
            interactionMode: thread.interactionMode,
            createdAt: new Date().toISOString(),
          },
        }),
      );
      // The new thread already exists and has its first message; a rejected settle (for
      // example a delegated result woke the old thread) must not strand the user here.
      save({ ...state, nextThreadId: id, startedNextThreadId: id });
      setPendingNavigationId(id);
      const settled = await settle({
        environmentId,
        input: { threadId: thread.id, commandId: CommandId.make(`context-handoff:settle:${id}`) },
      });
      if (settled._tag === "Failure") setError("旧会话未能自动收起，可在侧栏手动收起");
    });
  if (thread.lineage.relationshipToParent === "subagent") return null;
  const continued =
    nextThread &&
    (state.startedNextThreadId === nextThread.id ||
      thread.settledOverride === "settled" ||
      state.nextThreadId === undefined);
  const compacting = projection.turnItems.some(
    (item) =>
      item.type === "compaction" &&
      ["pending", "running", "waiting"].includes(item.status) &&
      projection.runs.some(
        (run) =>
          run.id === item.runId &&
          ["preparing", "starting", "running", "waiting"].includes(run.status),
      ),
  );
  if (
    level === null &&
    !state.requestMessageId &&
    !handoffPath &&
    !budgetBlocked &&
    !continued &&
    !showThroughput &&
    !(enabled && usage !== null)
  )
    return null;
  const label = budgetBlocked
    ? "上下文不足 · 恢复"
    : error
      ? "交接失败 · 重试"
      : continued
        ? "已交接"
        : pending
          ? "整理交接中"
          : ready
            ? "交接已就绪"
            : compacting
              ? "压缩中"
              : ratio !== null
                ? `上下文 ${Math.round(ratio * 100)}%`
                : "会话详情";
  const description = budgetBlocked
    ? "当前请求未执行。可压缩当前会话，或在新会话读取旧记录；原记录会保留。"
    : compacting
      ? "正在整理当前会话，请等待完成。草稿与原记录会保留。"
      : pending
        ? pendingRun?.status === "queued"
          ? "交接指令已排队，当前轮结束后执行。"
          : "正在整理交接，写好后即可开新会话。"
        : ready
          ? "交接已写好，可在新会话继续。"
          : missing
            ? "没找到交接文件，可重试整理或不带交接继续。"
            : continued
              ? "任务已在新会话继续，旧记录仍保留在这里。"
              : level !== null
                ? ratio !== null && ratio >= 0.6
                  ? "当前上下文用量偏高。可继续输入，或整理后继续。"
                  : "会话记录较多，浏览和加载可能变慢。可整理后在新会话继续。"
                : "管理当前会话的上下文与用量。";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            size="xs"
            variant={
              budgetBlocked || error
                ? "destructive-outline"
                : level === "strong"
                  ? "warning-outline"
                  : "ghost-muted"
            }
          />
        }
        aria-label={label}
        data-context-handoff={
          budgetBlocked
            ? "blocked"
            : compacting
              ? "compacting"
              : continued
                ? "continued"
                : ready
                  ? "ready"
                  : pending
                    ? "pending"
                    : (level ?? "normal")
        }
      >
        {budgetBlocked || error ? <CircleAlertIcon /> : null}
        <span className="tabular-nums whitespace-nowrap">{label}</span>
        <ChevronDownIcon />
      </PopoverTrigger>
      <PopoverPopup side="top" align="end" width="md">
        <div className="space-y-3 text-xs leading-relaxed" data-context-details>
          <PopoverTitle>上下文与用量</PopoverTitle>
          <p>{description}</p>
          {usage?.usedTokens != null ? (
            <p className="text-muted-foreground tabular-nums">
              最近上报约 {Math.round(usage.usedTokens / 1000)}{uiText("k tokens") + " "}{ratio === null ? "" : ` · ${Math.round(ratio * 100)}%`} · {thread.itemCount} 条记录 /
              第 {turns} 轮{disconnected ? " · 连接中断，数据可能过期" : ""}
            </p>
          ) : null}
          {pendingSubtasks > 0 ? (
            <p className="text-muted-foreground">
              还有 {pendingSubtasks} 个子任务在运行，结果会回到当前会话。
            </p>
          ) : null}
          {continued ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void openThread(nextThread.id);
              }}
            >
              打开接续会话
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!pending &&
                (ready ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy || disabled || active}
                    onClick={() => {
                      void continueThread(handoffPath);
                    }}
                  >
                    开新会话继续
                  </Button>
                ) : budgetBlocked ? (
                  <>
                    {onCompact ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy || disabled || compactDisabled}
                        onClick={onCompact}
                      >
                        压缩当前会话
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy || disabled || active}
                      onClick={() => {
                        void continueThread(null);
                      }}
                    >
                      开新会话读取旧记录
                    </Button>
                  </>
                ) : missing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy || disabled}
                      onClick={() => {
                        file.refresh();
                        void requestHandoff();
                      }}
                    >
                      重试
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy || disabled || active}
                      onClick={() => {
                        void continueThread(null);
                      }}
                    >
                      仍然开新会话（不带交接）
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy || disabled}
                    onClick={() => {
                      void requestHandoff();
                    }}
                  >
                    交接到新会话
                  </Button>
                ))}

              {!budgetBlocked && !pending && !ready && !missing && onCompact ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy || disabled || compactDisabled || compacting}
                  onClick={onCompact}
                >
                  压缩当前会话
                </Button>
              ) : null}
            </div>
          )}
          {!state.requestMessageId && !handoffPath && enabled ? (
            <Button
              size="xs"
              variant="ghost-muted"
              onClick={() => {
                setDismissed(!dismissed);
                try {
                  localStorage.setItem(`${key}:dismissed`, String(!dismissed));
                } catch {
                  /* In-memory preference remains available. */
                }
              }}
            >
              {dismissed ? "恢复普通提醒" : "关闭普通提醒"}
            </Button>
          ) : null}
          {error ? (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          ) : null}
          {showThroughput && open ? (
            <div className="border-t border-border pt-3">
              <TurnThroughput projection={projection} disconnected={disconnected} />
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
