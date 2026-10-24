import { describe, expect, it } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { selectTurnThroughput, throughputReading } from "./turnThroughput";
const at = (seconds: number) => DateTime.makeUnsafe(seconds * 1000);
function fixture() {
  return {
    thread: { activeRunId: "run" },
    runs: [
      {
        id: "run",
        ordinal: 2,
        activeAttemptId: "attempt",
        providerInstanceId: "codex",
        modelSelection: { model: "active-model" },
        status: "running",
        requestedAt: at(1),
        startedAt: at(10),
        completedAt: null,
      },
    ],
    attempts: [{ id: "attempt", runId: "run", attemptOrdinal: 1 }],
    providerTurns: [
      {
        id: "turn",
        runAttemptId: "attempt",
        ordinal: 1,
        status: "running",
        startedAt: at(10),
        completedAt: null,
        turnTokenUsage: { usageStatus: "partial", outputTokens: 200, reasoningTokens: 80 },
        tokenUsage: { updatedAt: new Date(20000).toISOString(), outputTokens: 12 },
      },
    ],
    turnItems: [],
  } as unknown as OrchestrationV2ThreadProjection;
}
describe("turn throughput", () => {
  it("uses accumulated output once, including reasoning, never last-response/context tokens", () => {
    const s = selectTurnThroughput(fixture())!;
    expect(throughputReading(s, 30000).rate).toBe(10);
    expect(s.model).toBe("active-model");
    expect(s.partial).toBe(true);
    expect(throughputReading(s, 40000).rate).toBeCloseTo(200 / 30);
  });
  it("freezes a finished round instead of ticking on", () => {
    const p = fixture();
    const done = {
      ...p,
      runs: p.runs.map((r) => ({ ...r, status: "completed" as const, completedAt: at(30) })),
      providerTurns: p.providerTurns.map((t) => ({
        ...t,
        status: "completed" as const,
        completedAt: at(30),
      })),
    };
    // Frozen at completion; TurnThroughputStatus hides it after RECENT_THROUGHPUT_MS.
    const s = selectTurnThroughput(done)!;
    expect(s.running).toBe(false);
    expect(s.quietApplies).toBe(false);
    expect(throughputReading(s, 999000).rate).toBe(10);
  });
  it("reports missing telemetry rather than zero or previous turn usage", () => {
    const p = fixture();
    const s = selectTurnThroughput({
      ...p,
      providerTurns: p.providerTurns.map((t) => ({ ...t, turnTokenUsage: undefined })),
    })!;
    expect(throughputReading(s, 30000).rate).toBeNull();
    const next = {
      ...p,
      runs: p.runs.map((r) => ({ ...r, activeAttemptId: "retry" as never })),
      attempts: [],
    };
    expect(selectTurnThroughput(next)?.outputTokens).toBeNull();
  });
  it("resets on the next native turn and does not sum earlier goal turns", () => {
    const p = fixture();
    const next = {
      ...p.providerTurns[0]!,
      id: "turn2" as never,
      ordinal: 2,
      startedAt: at(30),
      turnTokenUsage: { ...p.providerTurns[0]!.turnTokenUsage!, outputTokens: 50 },
    };
    const s = selectTurnThroughput({ ...p, providerTurns: [...p.providerTurns, next] })!;
    expect(throughputReading(s, 40000).rate).toBe(5);
    expect(throughputReading(s, 30000).rate).toBeNull();
    expect(throughputReading(s, 29000).rate).toBeNull();
  });
  it("distinguishes a measured zero and rejects invalid counts", () => {
    const s = selectTurnThroughput(fixture())!;
    expect(throughputReading({ ...s, outputTokens: 0 }, 30000).rate).toBe(0);
    const p = fixture();
    const invalid = {
      ...p,
      providerTurns: p.providerTurns.map((t) => ({
        ...t,
        turnTokenUsage: { ...t.turnTokenUsage!, outputTokens: NaN },
      })),
    };
    expect(selectTurnThroughput(invalid)?.outputTokens).toBeNull();
  });
  it("shows tool waiting without confusing a child's output with the parent", () => {
    const p = fixture();
    const item = {
      runId: "run",
      providerTurnId: "turn",
      status: "running",
      type: "command_execution",
      updatedAt: at(22),
    };
    const child = {
      ...item,
      providerTurnId: "child",
      type: "assistant_message",
      updatedAt: at(27),
    };
    const s = selectTurnThroughput({ ...p, turnItems: [item, child] as never })!;
    expect(s.phase).toBe("执行工具 / 子任务");
    expect(throughputReading(s, 40000).quietMs).toBe(18000);
  });
  it("does not tick for a queued round while the queue is paused", () => {
    const p = fixture();
    const paused = {
      ...p,
      runs: [
        { ...p.runs[0]!, status: "interrupted" as const, completedAt: at(30) },
        {
          ...p.runs[0]!,
          id: "queued" as never,
          ordinal: 3,
          status: "queued" as const,
          activeAttemptId: null,
          startedAt: null,
        },
      ],
    };
    expect(selectTurnThroughput(paused)).toBeNull();
  });
  it("keeps following the executing round when a newer one is queued behind it", () => {
    const p = fixture();
    const s = selectTurnThroughput({
      ...p,
      runs: [
        ...p.runs,
        { ...p.runs[0]!, id: "queued" as never, ordinal: 3, status: "queued" as const },
      ],
    })!;
    expect(s.key).toBe("run:turn");
    expect(s.outputTokens).toBe(200);
  });
});
