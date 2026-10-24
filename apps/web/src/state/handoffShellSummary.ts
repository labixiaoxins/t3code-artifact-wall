import { Atom } from "effect/reactivity";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import type { ThreadId } from "@t3tools/contracts";

/** Only fields that affect handoff controls; message and title updates are irrelevant. */
export function handoffShellSummary(
  shells: ReadonlyArray<Omit<EnvironmentThreadShell, "environmentId">>,
  parentThreadId: ThreadId,
) {
  let pendingSubtasks = 0;
  let nextThreadId: ThreadId | null = null;
  for (const candidate of shells) {
    if (candidate.deletedAt !== null) continue;
    if (nextThreadId === null && candidate.continuedFromThreadId === parentThreadId) {
      nextThreadId = candidate.id;
    }
    if (
      candidate.lineage.relationshipToParent === "subagent" &&
      candidate.lineage.parentThreadId === parentThreadId &&
      candidate.archivedAt === null &&
      candidate.runtime !== null &&
      ["preparing", "starting", "running", "waiting", "queued"].includes(candidate.runtime.status)
    ) {
      pendingSubtasks++;
    }
  }
  return { pendingSubtasks, nextThreadId };
}

export function createHandoffSummaryAtom(
  shells: Atom.Atom<ReadonlyArray<Omit<EnvironmentThreadShell, "environmentId">>>,
  parentThreadId: ThreadId,
) {
  let previous = { pendingSubtasks: 0, nextThreadId: null as ThreadId | null };
  return Atom.make((get) => {
    const next = handoffShellSummary(get(shells), parentThreadId);
    if (
      next.pendingSubtasks === previous.pendingSubtasks &&
      next.nextThreadId === previous.nextThreadId
    )
      return previous;
    previous = next;
    return next;
  });
}
