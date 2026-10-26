import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEnvironmentThread } from "../../state/threads";
import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import { uiText } from "~/i18n";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { memo, useEffect, useMemo, useState } from "react";
import {
  selectTurnThroughput,
  throughputReading,
  formatThroughputDuration,
} from "./turnThroughput";

/** Local one-second clock only; no polling requests or updates to the chat timeline. */
export const TurnThroughput = memo(function TurnThroughput({
  projection,
  environmentId,
  threadId,
  disconnected = false,
}: {
  projection: ThreadStructure;
  environmentId?: EnvironmentId;
  threadId?: ThreadId;
  disconnected?: boolean;
}) {
  // Subscribe to streaming details only while this on-demand panel is mounted.
  const live = useEnvironmentThread(environmentId ?? null, threadId ?? null);
  const current = Option.getOrNull(live.data) ?? projection;
  const snapshot = useMemo(() => selectTurnThroughput(current), [current]);
  const [now, setNow] = useState(() => Date.now());
  const ticking = snapshot?.running === true && !disconnected;
  useEffect(() => {
    if (!ticking) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
      if (document.visibilityState !== "hidden") {
        setNow(Date.now());
        timer = setInterval(() => setNow(Date.now()), 1000);
      }
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (timer !== undefined) clearInterval(timer);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [ticking]);
  if (!snapshot) return <p className="text-muted-foreground">本轮用量尚未上报。</p>;
  const reading = throughputReading(snapshot, now);
  const measurable = reading.rate !== null && !disconnected;
  const rate = measurable ? `${reading.rate!.toFixed(1)} tok/s` : "尚未上报";
  const phase = disconnected ? "连接断开" : snapshot.phase;
  return (
    <section
      className="space-y-2 text-xs text-muted-foreground"
      data-turn-throughput
      aria-label="本轮用量详情"
    >
      <p className="font-medium text-foreground">
        {phase} ·{" "}
        {measurable ? `端到端均速 ${rate}` : disconnected ? "用量数据已过期" : "用量尚未上报"}
      </p>
      <div className="space-y-1 pb-2 leading-relaxed" data-throughput-details>
        <p>
          模型：{snapshot.provider} / {snapshot.model}。当前模型轮次耗时{" "}
          {formatThroughputDuration(reading.elapsedMs)}。
        </p>
        <p>
          {snapshot.outputTokens === null
            ? "提供商尚未上报本轮 Token 用量。"
            : uiText("已上报输出 {0} tokens{1}。", {"0": snapshot.outputTokens.toLocaleString(), "1": snapshot.partial ? "（部分数据）" : ""})}
          {snapshot.running && reading.reportAgeMs !== null
            ? ` 用量上报于 ${formatThroughputDuration(reading.reportAgeMs)} 前。`
            : ""}
        </p>
        <p>端到端均速包含思考、工具和网络等待，不是纯生成速度；用量可能延迟上报。</p>
        <p>仅统计当前会话的主任务，子任务用量请在对应会话查看。</p>
        {disconnected ? <p>连接恢复前暂停速率显示，避免把旧数据当成实时结果。</p> : null}
      </div>
    </section>
  );
});
