import type {
  OrchestrationV2ThreadProjection,
  OrchestrationV2ThreadShell,
  ThreadId,
} from "@t3tools/contracts";

/** A budget rejection occurs before the provider runs; repeating a normal turn cannot recover it.
 * Only the latest run matters, so a successful compaction clears the recovery state.
 * Older servers report this error without a machine-readable code.
 */
export function hasHandoffBudgetFailure(
  projection: Pick<OrchestrationV2ThreadProjection, "runs" | "turnItems">,
): boolean {
  const latest = projection.runs.reduce<(typeof projection.runs)[number] | undefined>(
    (previous, run) => (!previous || run.ordinal > previous.ordinal ? run : previous),
    undefined,
  );
  return (
    latest?.status === "failed" &&
    projection.turnItems.some(
      (item) =>
        item.type === "error" &&
        item.runId === latest.id &&
        (item.failure.code === "context_handoff_budget_exceeded" ||
          item.failure.message.startsWith(
            "Insufficient context allowance for the provider handoff.",
          )),
    )
  );
}

/** Absolute thresholds are a fallback only when the provider reports no window size. */
export const LONG_CONVERSATION_THRESHOLDS = {
  reminder: { contextRatio: 0.6, tokens: 150_000, items: 800, turns: 30 },
  strong: { contextRatio: 0.8, tokens: 250_000, items: 1500, turns: 50 },
} as const;

export function contextRatio(
  usage: { usedTokens: number; maxTokens?: number | null | undefined } | null,
) {
  return usage !== null &&
    Number.isFinite(usage.usedTokens) &&
    usage.usedTokens >= 0 &&
    usage.maxTokens != null &&
    Number.isFinite(usage.maxTokens) &&
    usage.maxTokens > 0
    ? usage.usedTokens / usage.maxTokens
    : null;
}

export function longConversationLevel(input: {
  enabled: boolean;
  dismissed: boolean;
  relationshipToParent: string | null;
  items: number;
  turns: number;
  ratio: number | null;
  usedTokens?: number | null;
}): "reminder" | "strong" | null {
  if (input.relationshipToParent === "subagent") return null;
  // Muting ordinary reminders must not hide a session about to exhaust its window.
  if (input.ratio !== null && input.ratio >= 0.95) return "strong";
  if (!input.enabled) return null;
  for (const level of ["strong", "reminder"] as const) {
    if (level === "reminder" && input.dismissed) continue;
    const threshold = LONG_CONVERSATION_THRESHOLDS[level];
    if (
      (input.ratio !== null && input.ratio >= threshold.contextRatio) ||
      (input.ratio === null &&
        input.usedTokens != null &&
        Number.isFinite(input.usedTokens) &&
        input.usedTokens >= threshold.tokens) ||
      input.items >= threshold.items ||
      input.turns >= threshold.turns
    )
      return level;
  }
  return null;
}

const MARKDOWN_WRAPPERS = /^(?:\*\*|__|`|<|「|“|")+|(?:\*\*|__|`|>|」|”|")+$/gu;

/**
 * Strict mode (no handoff was requested) only accepts a plain final `HANDOFF: /abs` line, so
 * ordinary replies that mention a handoff file never raise the banner. After a request,
 * models decorate paths (backticks, bold, angle brackets, a trailing note), so the line is
 * searched in the last few lines, stripped, and cut after the `.md` file name.
 */
export function parseHandoffPath(text: string, options: { strict?: boolean } = {}): string | null {
  const lines = text
    .trimEnd()
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (options.strict) {
    const path = lines
      .at(-1)
      ?.match(/^HANDOFF:\s+(\/\S.*)$/u)?.[1]
      ?.trim();
    return path && !path.includes("\0") ? path : null;
  }
  for (const line of lines.slice(-5).toReversed()) {
    const match = line
      .replace(MARKDOWN_WRAPPERS, "")
      .match(/^(?:[-*]\s+)?(?:\*\*)?HANDOFF(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(.+)$/iu);
    if (!match?.[1]) continue;
    const path = match[1]
      .trim()
      .replace(MARKDOWN_WRAPPERS, "")
      // Drop a trailing note such as "（已写好）" or " (done)" after the file name.
      .replace(/^(.*?\.md)(?=[\s`*）)（(，,。]|$).*$/su, "$1")
      .replace(/[。．.，,；;：:]+$/u, "")
      .replace(MARKDOWN_WRAPPERS, "")
      .trim();
    if ((path.startsWith("/") || /^[A-Za-z]:[\\/]/u.test(path)) && !path.includes("\0"))
      return path;
  }
  return null;
}

function handoffDay(date: Date) {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

/** The client fixes the file location up front so a mis-formatted reply can still be found. */
export function expectedHandoffPath(cwd: string, threadId: string, date = new Date()) {
  return `${cwd.replace(/[\\/]+$/u, "")}/HANDOFF-${threadId.slice(0, 8)}-${handoffDay(date)}.md`;
}

export function buildHandoffInstruction(path: string, pendingSubtasks = 0) {
  const subtasks =
    pendingSubtasks > 0
      ? `本会话还有 ${pendingSubtasks} 个委派子任务未结束：在交接里逐个列出子任务 / taskId、当前状态和新会话如何回收结果（例如 task_status），它们的结果仍会送回本会话。`
      : "";
  return `请停止扩展当前任务，整理交接。把交接写到这个文件：${path}\n内容包含：目标、已做、证据位置、未做、需要用户决定的事、回滚。只写仍有效的内容，不复制聊天记录。${subtasks}\n回复最后单独一行，不加任何格式，例如：\nHANDOFF: ${path}\n写好交接后停止，不再接新任务。`;
}

export function continuationParameters(
  thread: Pick<
    OrchestrationV2ThreadShell,
    | "id"
    | "projectId"
    | "title"
    | "modelSelection"
    | "runtimeMode"
    | "interactionMode"
    | "branch"
    | "worktreePath"
  >,
  threadId: ThreadId,
  handoffPath: string | null,
) {
  const title = `${thread.title}（续）`;
  return {
    create: {
      threadId,
      continuationOfThreadId: thread.id,
      projectId: thread.projectId,
      title,
      modelSelection: thread.modelSelection,
      runtimeMode: thread.runtimeMode,
      interactionMode: thread.interactionMode,
      branch: thread.branch,
      worktreePath: thread.worktreePath,
    },
    prompt:
      handoffPath === null
        ? `接手旧会话《${thread.title}》（${thread.id}）。没有交接文件：先用 t3_thread_read 分页读取旧会话（threadId: ${thread.id}，先读取消息视图，limit: 50，maxCharsPerItem: 4000；按返回的 nextPosition 作为 afterPosition 继续向后分页，直到 hasMore 为 false；长消息按 nextTextOffset 续读），自己整理出目标、已做、未做和需要用户决定的事，写成本目录下的 HANDOFF 文件，再按未完成事项继续；只有拿不准的地方再问用户。不要猜测没读到的内容。`
        : `接手旧会话《${thread.title}》（${thread.id}）。先完整读取 ${handoffPath}，按其中未完成事项继续；已验证的部分不要重做。`,
  };
}
