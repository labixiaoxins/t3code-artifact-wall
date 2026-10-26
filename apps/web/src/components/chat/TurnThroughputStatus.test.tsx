import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import * as DateTime from "effect/DateTime";
import type { OrchestrationV2ThreadProjection } from "@t3tools/contracts";
import { TurnThroughput } from "./TurnThroughputStatus";
function fixture() {
  const at = (n: number) => DateTime.makeUnsafe(n);
  return {
    runs: [
      {
        id: "run",
        ordinal: 1,
        activeAttemptId: "attempt",
        providerInstanceId: "codex",
        modelSelection: { model: "gpt-6-astra" },
        status: "running",
        requestedAt: at(0),
        startedAt: at(0),
        completedAt: null,
      },
    ],
    attempts: [],
    providerTurns: [
      {
        id: "turn",
        runAttemptId: "attempt",
        ordinal: 1,
        status: "running",
        startedAt: at(0),
        completedAt: null,
        turnTokenUsage: { usageStatus: "partial", outputTokens: 100 },
        tokenUsage: { updatedAt: new Date(9000).toISOString() },
      },
    ],
    turnItems: [],
  } as unknown as OrchestrationV2ThreadProjection;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("updates locally, suspends while hidden/disconnected and tears down its clock", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const page = Object.assign(new EventTarget(), { visibilityState: "visible" });
  vi.stubGlobal("document", page);
  let view!: ReactTestRenderer;
  const p = fixture();
  await act(async () => {
    view = create(<TurnThroughput projection={p} />);
  });
  const text = () => JSON.stringify(view.toJSON());
  expect(text()).toContain("10.0 tok/s");
  await act(async () => {
    vi.advanceTimersByTime(10000);
  });
  expect(text()).toContain("5.0 tok/s");
  await act(async () => {
    page.visibilityState = "hidden";
    page.dispatchEvent(new Event("visibilitychange"));
  });
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => {
    page.visibilityState = "visible";
    page.dispatchEvent(new Event("visibilitychange"));
  });
  expect(vi.getTimerCount()).toBe(1);
  await act(async () => {
    view.update(<TurnThroughput projection={p} disconnected />);
  });
  expect(text()).not.toContain("— tok/s");
  expect(text()).toContain("用量数据已过期");
  expect(text()).toContain("连接断开");
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => view.unmount());
  expect(vi.getTimerCount()).toBe(0);
});
it("retains a finished round without a collapse timer so details stay available", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(20000);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
  const at = (n: number) => DateTime.makeUnsafe(n);
  const p = fixture();
  const done = {
    ...p,
    runs: p.runs.map((r) => ({ ...r, status: "completed" as const, completedAt: at(10000) })),
    providerTurns: p.providerTurns.map((t) => ({
      ...t,
      status: "completed" as const,
      completedAt: at(10000),
      turnTokenUsage: { usageStatus: "complete" as const, outputTokens: 100 },
    })),
  } as unknown as OrchestrationV2ThreadProjection;
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<TurnThroughput projection={done} />);
  });
  expect(JSON.stringify(view.toJSON())).toContain("10.0 tok/s");
  expect(JSON.stringify(view.toJSON())).not.toContain("无新活动");
  await act(async () => {
    vi.advanceTimersByTime(2 * 60 * 1000);
  });
  expect(JSON.stringify(view.toJSON())).toContain("10.0 tok/s");
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => view.unmount());
  // Opening an older thread keeps its last completed reading without starting a timer.
  vi.setSystemTime(10_000_000);
  await act(async () => {
    view = create(<TurnThroughput projection={done} />);
  });
  expect(JSON.stringify(view.toJSON())).toContain("10.0 tok/s");
  expect(vi.getTimerCount()).toBe(0);
  await act(async () => view.unmount());
});
