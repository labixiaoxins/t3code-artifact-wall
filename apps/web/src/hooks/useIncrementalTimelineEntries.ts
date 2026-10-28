import { useLayoutEffect, useRef } from "react";
import {
  deriveTimelineEntriesFromVisibleTurnItemsWithState,
  type TimelineEntriesInput,
  type TimelineEntriesProjection,
} from "../session-logic";

function sameInput(left: TimelineEntriesInput, right: TimelineEntriesInput): boolean {
  return (
    left.visibleTurnItems === right.visibleTurnItems &&
    left.optimisticMessages === right.optimisticMessages &&
    left.anchoredMessages === right.anchoredMessages &&
    left.attachmentUrlById === right.attachmentUrlById &&
    left.attempts === right.attempts &&
    left.nodes === right.nodes &&
    left.plans === right.plans
  );
}

export function useIncrementalTimelineEntries(
  threadKey: string | null,
  input: TimelineEntriesInput,
): TimelineEntriesProjection["entries"] {
  // This is a derived cache, not UI state. Inputs may be rebuilt by a caller
  // when its React compiler optimization is unavailable; deriving must never
  // schedule another render of that same caller.
  const committed = useRef<{
    threadKey: string | null;
    projection: TimelineEntriesProjection;
  } | null>(null);
  const state = committed.current;
  const projection =
    state?.threadKey === threadKey && sameInput(state.projection.input, input)
      ? state.projection
      : deriveTimelineEntriesFromVisibleTurnItemsWithState(
    input,
          state?.threadKey === threadKey ? state.projection : null,
  );
  useLayoutEffect(() => {
    committed.current = { threadKey, projection };
  }, [threadKey, projection]);
  return projection.entries;
}
