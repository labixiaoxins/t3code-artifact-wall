import { describe, expect, it } from "vite-plus/test";
import {
  NodeId,
  PlanId,
  RunId,
  TurnItemId,
  MessageId,
  type OrchestrationV2Run,
  type OrchestrationV2PlanStep,
  type OrchestrationV2TurnItem,
  type OrchestrationV2ExecutionNode,
} from "@t3tools/contracts";
import { makeThreadFixture, makeThreadProjectionFixture } from "./test-fixtures";
import { taskProgressSnapshot } from "./taskProgress";

function fixture(status: OrchestrationV2Run["status"] = "running") {
  const base = makeThreadProjectionFixture();
  const run: OrchestrationV2Run = {
    id: RunId.make("run-1"),
    threadId: base.thread.id,
    ordinal: 1,
    providerInstanceId: base.thread.providerInstanceId,
    modelSelection: base.thread.modelSelection,
    providerThreadId: null,
    userMessageId: MessageId.make("user-1"),
    rootNodeId: null,
    activeAttemptId: null,
    status,
    requestedAt: base.updatedAt,
    startedAt: base.updatedAt,
    completedAt: null,
    checkpointId: null,
    contextHandoffId: null,
  };
  const steps: readonly OrchestrationV2PlanStep[] = [
    { id: "read", text: "核对需求", status: "completed" },
    { id: "test", text: "测试", status: "running" },
    { id: "ship", text: "交付", status: "pending" },
  ];
  const plan = {
    id: PlanId.make("plan-1"),
    threadId: base.thread.id,
    runId: run.id,
    nodeId: NodeId.make("root"),
    kind: "todo_list" as const,
    status: "active" as const,
    steps,
  };
  const projection = { ...base, runs: [run], plans: [plan] };
  const shell = makeThreadFixture({
    latestRun: {
      runId: run.id,
      status,
      requestedAt: null,
      startedAt: null,
      completedAt: null,
      assistantMessageId: null,
    },
    runtime: null,
  });
  return { projection, shell, run, plan };
}

describe("task progress", () => {
  it("binds native subagent plans to their current root turn", () => {
    const { projection, plan } = fixture();
    const rootId = NodeId.make("native-root");
    const root: OrchestrationV2ExecutionNode = {
      id: rootId,
      threadId: projection.thread.id,
      runId: null,
      parentNodeId: null,
      rootNodeId: rootId,
      kind: "root_turn",
      status: "running",
      countsForRun: true,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      runtimeRequestId: null,
      checkpointScopeId: null,
      startedAt: projection.updatedAt,
      completedAt: null,
    };
    const native = {
      ...projection,
      runs: [],
      nodes: [root],
      thread: {
        ...projection.thread,
        creationSource: "provider" as const,
        lineage: { ...projection.thread.lineage, relationshipToParent: "subagent" as const },
      },
      plans: [{ ...plan, runId: null, nodeId: rootId }],
    };
    expect(taskProgressSnapshot(native, null)).toMatchObject({ total: 3, state: "running" });
    expect(
      taskProgressSnapshot({ ...native, nodes: [{ ...root, status: "failed" }] }, null).state,
    ).toBe("failed");
    const nextId = NodeId.make("native-next");
    expect(
      taskProgressSnapshot(
        { ...native, nodes: [root, { ...root, id: nextId, rootNodeId: nextId }] },
        null,
      ),
    ).toMatchObject({ total: 0, state: "empty" });
  });
  it("counts only reported completed steps and includes current work in remaining", () => {
    const { projection, shell } = fixture();
    expect(taskProgressSnapshot(projection, shell)).toMatchObject({
      completed: 1,
      total: 3,
      remaining: 2,
      state: "running",
      stale: false,
    });
    expect(taskProgressSnapshot({ ...projection, subagents: [] }, shell).total).toBe(3);
  });
  it.each([
    ["completed", "incomplete"],
    ["cancelled", "stopped"],
    ["interrupted", "stopped"],
    ["failed", "failed"],
  ] as const)("preserves incomplete steps after %s", (status, state) => {
    const { projection, shell } = fixture(status);
    expect(taskProgressSnapshot(projection, shell)).toMatchObject({
      completed: 1,
      remaining: 2,
      state,
    });
  });
  it("requires every step to complete, even if the plan artifact claims completion", () => {
    const { projection, shell, plan } = fixture("completed");
    expect(
      taskProgressSnapshot({ ...projection, plans: [{ ...plan, status: "completed" }] }, shell)
        .state,
    ).toBe("incomplete");
    expect(
      taskProgressSnapshot(
        {
          ...projection,
          plans: [{ ...plan, steps: plan.steps.map((step) => ({ ...step, status: "completed" })) }],
        },
        shell,
      ).state,
    ).toBe("complete");
  });
  it("gives real waits precedence and marks disconnected data as stale", () => {
    const { projection, shell } = fixture();
    expect(taskProgressSnapshot(projection, { ...shell, hasPendingApprovals: true }).state).toBe(
      "approval",
    );
    expect(taskProgressSnapshot(projection, { ...shell, hasPendingUserInput: true }).state).toBe(
      "input",
    );
    expect(taskProgressSnapshot(projection, { ...shell, blockedOnThreadWait: true }).state).toBe(
      "waiting",
    );
    expect(taskProgressSnapshot(projection, shell, false)).toMatchObject({
      completed: 1,
      stale: true,
    });
  });
  it("never treats the previous run's plan as current", () => {
    const { projection, shell, run } = fixture();
    const nextRun = { ...run, id: RunId.make("run-2"), ordinal: 2 };
    const nextShell = { ...shell, latestRun: { ...shell.latestRun!, runId: nextRun.id } };
    expect(taskProgressSnapshot(projection, nextShell)).toMatchObject({
      state: "loading",
      total: 0,
    });
    expect(taskProgressSnapshot({ ...projection, runs: [nextRun, run] }, nextShell)).toMatchObject({
      state: "empty",
      total: 0,
    });
  });
  it("keeps an active run's plan when another turn is queued", () => {
    const { projection, shell, run } = fixture();
    const queued = {
      ...run,
      id: RunId.make("queued"),
      ordinal: 2,
      status: "queued" as const,
      startedAt: null,
    };
    expect(
      taskProgressSnapshot(
        { ...projection, runs: [queued, run] },
        { ...shell, latestRun: { ...shell.latestRun!, runId: queued.id, status: "queued" } },
      ),
    ).toMatchObject({ total: 3, state: "running" });
  });
  it("excludes rolled back, draft and superseded plans", () => {
    const { projection, shell, plan } = fixture();
    for (const status of ["draft", "superseded"] as const) {
      expect(
        taskProgressSnapshot({ ...projection, plans: [{ ...plan, status }] }, shell).total,
      ).toBe(0);
    }
    const rolled = fixture("rolled_back");
    expect(taskProgressSnapshot(rolled.projection, rolled.shell).total).toBe(0);
  });
  it("orders replacement plans by turn-item ordinal, not their array order", () => {
    const { projection, shell, plan } = fixture();
    const next = {
      ...plan,
      id: PlanId.make("new-plan"),
      steps: [{ id: "new", text: "新步骤", status: "running" as const }],
    };
    const item = (planId: typeof plan.id, ordinal: number): OrchestrationV2TurnItem => ({
      id: TurnItemId.make(String(ordinal)),
      threadId: projection.thread.id,
      runId: plan.runId,
      nodeId: plan.nodeId,
      providerThreadId: null,
      providerTurnId: null,
      nativeItemRef: null,
      parentItemId: null,
      ordinal,
      type: "todo_list",
      planId,
      steps: [],
      status: "completed",
      title: null,
      startedAt: null,
      completedAt: null,
      updatedAt: projection.updatedAt,
    });
    expect(
      taskProgressSnapshot(
        { ...projection, plans: [next, plan], turnItems: [item(next.id, 20), item(plan.id, 10)] },
        shell,
      ).steps,
    ).toEqual(next.steps);
  });
});
