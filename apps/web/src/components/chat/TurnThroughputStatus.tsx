import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEnvironmentThread } from "../../state/threads";
import type { ThreadStructure } from "@t3tools/client-runtime/state/shell";
import { memo, useEffect, useState } from "react";
import {
  selectTurnThroughput,
  throughputReading,
  formatThroughputDuration,
} from "./turnThroughput";

/** Local one-second clock only; no polling requests or updates to the chat timeline. */
export const TurnThroughput = memo(function TurnThroughput({
  projection,
  disconnected = false,
}: {
  projection: ThreadStructure;
  disconnected?: boolean;
}) {
  const snapshot = (() => selectTurnThroughput(projection))();
  const [now, setNow] = useState(() => Date.now());
  const ticking = snapshot?.running === true && !disconnected;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Keep the elapsed-time clock running only while the document is visible and the turn is active.
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
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5" data-throughput-details>
        <dt>状态</dt>
        <dd className="text-right text-foreground">{phase}</dd>
        <dt>耗时</dt>
        <dd className="text-right tabular-nums">{formatThroughputDuration(reading.elapsedMs)}</dd>
        <dt>输出</dt>
        <dd className="text-right tabular-nums">
          {snapshot.outputTokens === null
            ? "尚未上报"
            : `${snapshot.outputTokens.toLocaleString()} tokens${snapshot.partial ? "（部分）" : ""}`}
        </dd>
        <dt>端到端均速</dt>
        <dd className="text-right tabular-nums">{disconnected ? "用量数据已过期" : rate}</dd>
        <dt>模型</dt>
        <dd className="min-w-0 text-right break-words">
          {snapshot.provider} / {snapshot.model}
        </dd>
        {snapshot.running && reading.reportAgeMs !== null ? (
          <>
            <dt>最近上报</dt>
            <dd className="text-right tabular-nums">
              {formatThroughputDuration(reading.reportAgeMs)} 前
            </dd>
          </>
        ) : null}
      </dl>
      <p className="leading-relaxed">含思考、工具与网络等待；仅计当前会话主任务，上报可能延迟。</p>
    </section>
  );
});

/** The live subscription exists only while the usage details are expanded. */
export function LiveTurnThroughput(props: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  projection: ThreadStructure;
  disconnected: boolean;
}) {
  const live = useEnvironmentThread(props.environmentId, props.threadId);
  return (
    <TurnThroughput
      projection={Option.getOrNull(live.data) ?? props.projection}
      disconnected={props.disconnected}
    />
  );
}
