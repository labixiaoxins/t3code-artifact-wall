import type { EnvironmentThreadShell, ThreadStructure } from "@t3tools/client-runtime/state/shell";
import {
  deriveThreadActivityRun,
  deriveProviderSubagentStatus,
} from "@t3tools/client-runtime/state/thread-execution";
import type { OrchestrationV2PlanStep } from "@t3tools/contracts";

export interface TaskProgressSnapshot {
  readonly steps: readonly OrchestrationV2PlanStep[];
  readonly completed: number;
  readonly total: number;
  readonly remaining: number;
  readonly state:
    | "loading"
    | "empty"
    | "running"
    | "waiting"
    | "approval"
    | "input"
    | "stopped"
    | "failed"
    | "complete"
    | "incomplete"
    | "queued";
  readonly stale: boolean;
}

export function taskProgressSnapshot(
  projection: ThreadStructure | null,
  shell: EnvironmentThreadShell | null,
  connected = true,
): TaskProgressSnapshot {
  const empty = (
    state: TaskProgressSnapshot["state"],
    stale = !connected,
  ): TaskProgressSnapshot => ({
    steps: [],
    completed: 0,
    total: 0,
    remaining: 0,
    state,
    stale,
  });
  if (!projection) return empty("loading");
  const activity = deriveThreadActivityRun(projection);
  const shellRun = shell?.latestRun;
  const runId =
    shell?.runtime?.activeRunId ??
    (shellRun?.status !== "queued" ? shellRun?.runId : undefined) ??
    activity?.runId ??
    null;
  const run = projection.runs.find((candidate) => candidate.id === runId);
  if (runId !== null && !run) return empty("loading", true);
  if (run?.status === "rolled_back") return empty("empty");
  const status =
    runId === null
      ? deriveProviderSubagentStatus(projection)?.status
      : shellRun?.runId === runId
        ? shellRun.status
        : run?.status;
  const nativeRoot =
    runId === null && status !== undefined
      ? projection.nodes.findLast((node) => node.kind === "root_turn" && node.runId === null)
      : undefined;
  if (runId === null && (!nativeRoot || nativeRoot.status === "rolled_back")) return empty("empty");
  const itemOrdinals = new Map<string, number>();
  for (const item of projection.turnItems) {
    if (item.type === "todo_list") {
      itemOrdinals.set(item.planId, Math.max(itemOrdinals.get(item.planId) ?? -1, item.ordinal));
    }
  }
  const plans = projection.plans.filter(
    (plan) =>
      plan.kind === "todo_list" &&
      plan.runId === runId &&
      (runId !== null ||
        plan.nodeId === nativeRoot?.id ||
        projection.nodes.some(
          (node) => node.id === plan.nodeId && node.rootNodeId === nativeRoot?.id,
        )) &&
      plan.status !== "superseded" &&
      plan.status !== "draft",
  );
  const plan = plans.reduce<(typeof plans)[number] | null>(
    (latest, candidate) =>
      latest === null ||
      (itemOrdinals.get(candidate.id) ?? -1) >= (itemOrdinals.get(latest.id) ?? -1)
        ? candidate
        : latest,
    null,
  );
  const steps = plan?.kind === "todo_list" ? plan.steps : [];
  const completed = steps.filter((step) => step.status === "completed").length;
  let state: TaskProgressSnapshot["state"];
  if (status === "failed") state = "failed";
  else if (status === "cancelled" || status === "interrupted") state = "stopped";
  else if (shell?.hasPendingApprovals) state = "approval";
  else if (shell?.hasPendingUserInput) state = "input";
  else if (shell?.blockedOnThreadWait || status === "waiting") state = "waiting";
  else if (status === "queued" || status === "preparing" || status === "starting") state = "queued";
  else if (steps.length === 0) state = "empty";
  else if (completed === steps.length) state = "complete";
  else if (status === "running") state = "running";
  else state = "incomplete";
  return {
    steps,
    completed,
    total: steps.length,
    remaining: steps.length - completed,
    state,
    stale: !connected,
  };
}
