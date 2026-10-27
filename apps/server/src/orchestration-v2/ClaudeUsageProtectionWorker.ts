import { CommandId, MessageId, RunId, ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Scheduler from "../scheduling/Scheduler.ts";
import * as Protection from "./ClaudeUsageProtection.ts";
import * as Orchestrator from "./Orchestrator.ts";

export const makeSweep = Effect.gen(function* () {
  const guard = yield* Protection.ClaudeUsageProtection;
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const sent = new Set<string>();
  const sweep = Effect.gen(function* () {
    yield* guard.refresh;
    const notices = yield* guard.activeNotices;
    const liveKeys = new Set(
      notices.map((n) => `claude-usage-protection:${n.work.runId}:${n.key}:${n.stage}`),
    );
    for (const id of sent) if (!liveKeys.has(id)) sent.delete(id);
    for (const n of notices) {
      const id = `claude-usage-protection:${n.work.runId}:${n.key}:${n.stage}`;
      if (sent.has(id)) continue;
      yield* orchestrator.dispatch({
        type: "message.dispatch",
        commandId: CommandId.make(id),
        messageId: MessageId.make(id),
        threadId: ThreadId.make(n.work.threadId),
        createdBy: "system",
        creationSource: "server",
        attachments: [],
        usageProtectionForRunId: RunId.make(n.work.runId),
        dispatchMode: { type: "steer_active", targetRunId: RunId.make(n.work.runId) },
        text:
          n.stage === "finish"
            ? `自动额度保护：官方用量已达 ${Math.round(n.usedPercent)}%。请完成当前安全步骤，立即把已完成内容、文件、验证证据及剩余事项写入项目 HANDOFF.md，然后结束本轮。不要开启新任务、构建、委派或重复检查。现有聊天和文件须保留。新任务已排队等待额度恢复；不得自行切换模型或付费 API。`
            : `自动额度提醒：官方用量已达 ${Math.round(n.usedPercent)}%。请在下一个自然停顿点更新项目 HANDOFF.md，记录进度与未完成事项；减少重复检查，保留余量收尾。不要改变模型或启用付费 API。`,
      });
      sent.add(id);
    }
    yield* orchestrator.resumeQueuedRuns;
  });
  return { sweep };
});
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const { sweep } = yield* makeSweep;
    const scheduler = yield* Scheduler.Scheduler;
    yield* scheduler.register("claude-usage-protection", sweep);
  }),
);
