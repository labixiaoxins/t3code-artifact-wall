import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { useIncrementalTimelineRows, useStableHandoffRuns, useStableRows } from "./useMessagesTimelineRows";
import type { TimelineEntry } from "../../session-logic";

it("switches timeline identity and streams fresh inputs without scheduling render loops", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const renders = vi.fn();
  function Probe({ identity, text }: { identity: string; text: string }) {
    const entries: TimelineEntry[] = text === "" ? [] : [{
      kind: "message", id: `${identity}-message`, createdAt: "2026-10-21T00:00:00Z",
      message: { id: `${identity}-message` as never, role: "assistant", text, runId: null,
        createdAt: "2026-10-21T00:00:00Z", updatedAt: "2026-10-21T00:00:00Z", streaming: true },
    }];
    const rows = useIncrementalTimelineRows(identity, {
      timelineEntries: entries, latestRun: null, runningRunId: null,
      expandedRunIds: new Set(), expandedAttemptIds: new Set(), expandedWorkGroupIds: new Set(),
      isWorking: false, runlessWorkActive: false, activeTurnStartedAt: null,
      turnDiffSummaries: [], supportsConversationRollback: false,
      availableRevertTurnCounts: new Set(), threadStartCheckpointReady: false, worktreeSetup: null,
    });
    const stable = useStableRows(rows, identity);
    const runs = useStableHandoffRuns([]);
    renders(identity, stable.filter(row => row.kind === "message").map(row => row.message.text), runs.length);
    return null;
  }
  let root: ReactTestRenderer | undefined;
  try {
    await act(() => { root = create(<Probe identity="a" text="" />); });
    await act(() => { root!.update(<Probe identity="b" text="second" />); });
    await act(() => { root!.update(<Probe identity="b" text="second streamed" />); });
    await act(() => { root!.update(<Probe identity="a" text="first" />); });
    expect(renders.mock.calls).toEqual([["a", [], 0], ["b", ["second"], 0], ["b", ["second streamed"], 0], ["a", ["first"], 0]]);
  } finally {
    if (root) await act(() => root!.unmount());
    vi.unstubAllGlobals();
  }
});
