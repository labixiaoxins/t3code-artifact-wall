import { useLayoutEffect, useRef } from "react";
import { shallow } from "zustand/vanilla/shallow";
import type { HandoffTimelineRun } from "@t3tools/client-runtime/handoff";
import { computeStableMessagesTimelineRows, deriveMessagesTimelineRowsWithState,
 type MessagesTimelineRowsProjection, type MessagesTimelineRow,
 type StableMessagesTimelineRowsState } from "./MessagesTimeline.logic";
function handoffRunsSignature(runs: ReadonlyArray<HandoffTimelineRun>): string {
  return runs
    .map(
      (run) =>
        `${run.id}\0${run.providerInstanceId}\0${run.ordinal}\0${run.modelSelection.instanceId}\0${run.modelSelection.model}`,
    )
    .join("\n");
}

export function useStableHandoffRuns(
  runs: ReadonlyArray<HandoffTimelineRun>,
): ReadonlyArray<HandoffTimelineRun> {
  const committed = useRef<{
    readonly source: ReadonlyArray<HandoffTimelineRun>;
    readonly signature: string;
    readonly value: ReadonlyArray<HandoffTimelineRun>;
  } | null>(null);
  const previous = committed.current;
  const signature = previous?.source === runs ? previous.signature : handoffRunsSignature(runs);
  const value = previous?.signature === signature ? previous.value : runs.map((run) => ({
    id: run.id, ordinal: run.ordinal, providerInstanceId: run.providerInstanceId,
    modelSelection: run.modelSelection,
  }));
  useLayoutEffect(() => { committed.current = { source: runs, signature, value }; }, [runs, signature, value]);
  return value;
}

type MessagesTimelineRowsInput = MessagesTimelineRowsProjection["input"];

// Equivalent expanded sets do not invalidate the projection cache.
function sameRowsInput(left: MessagesTimelineRowsInput, right: MessagesTimelineRowsInput): boolean {
  for (const key of Object.keys(right) as Array<keyof MessagesTimelineRowsInput>) {
    const previous = left[key];
    const next = right[key];
    if (Object.is(previous, next)) continue;
    if (previous instanceof Set && next instanceof Set && shallow(previous, next)) continue;
    return false;
  }
  return Object.keys(left).length === Object.keys(right).length;
}

/**
 * Rows derived from the previous projection of the same list, so a streamed
 * text update patches its message rows instead of deriving every row again.
 */
export function useIncrementalTimelineRows(
  identity: string,
  input: MessagesTimelineRowsInput,
): MessagesTimelineRow[] {
  // Derivation must not schedule a render: callers can recreate arrays and maps
  // when compiler memoization bails out. Commit only caches from completed renders.
  const committed = useRef<{ identity: string; projection: MessagesTimelineRowsProjection } | null>(null);
  const previous = committed.current;
  const projection = previous?.identity === identity && sameRowsInput(previous.projection.input, input)
    ? previous.projection
    : deriveMessagesTimelineRowsWithState(input, previous?.identity === identity ? previous.projection : null);
  useLayoutEffect(() => { committed.current = { identity, projection }; }, [identity, projection]);
  return projection.rows;
}

export function useStableRows(rows: MessagesTimelineRow[], identity: string): MessagesTimelineRow[] {
  const committed = useRef<{
    readonly identity: string;
    readonly source: MessagesTimelineRow[];
    readonly stable: StableMessagesTimelineRowsState;
  } | null>(null);
  const previous = committed.current;
  const stable = previous?.identity === identity && previous.source === rows
    ? previous.stable
    : computeStableMessagesTimelineRows(rows,
        previous?.identity === identity ? previous.stable : { byId: new Map(), result: [] });
  useLayoutEffect(() => { committed.current = { identity, source: rows, stable }; }, [identity, rows, stable]);
  return stable.result;
}
