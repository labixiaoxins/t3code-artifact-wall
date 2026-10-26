import { expect, it } from "vite-plus/test";
import { accountAlias, executionSnapshot, quotaSnapshot } from "./runInspectorModel";
import { makeThreadProjectionFixture } from "../../test-fixtures";
import { ProviderThreadId, ProviderInstanceId, ProviderDriverKind } from "@t3tools/contracts";

it("does not call a requested selection an executed model", () => {
  expect(executionSnapshot(makeThreadProjectionFixture())).toBeNull();
});
it("uses reported metadata for the actual instance and model", () => {
  const projection = makeThreadProjectionFixture();
  const id = ProviderThreadId.make("pt");
  const instance = ProviderInstanceId.make("actual");
  const thread = {
    id,
    driver: ProviderDriverKind.make("codex"),
    providerInstanceId: instance,
    providerSessionId: null,
    appThreadId: projection.thread.id,
    ownerNodeId: null,
    nativeThreadRef: null,
    nativeConversationHeadRef: null,
    status: "active" as const,
    firstRunOrdinal: null,
    lastRunOrdinal: null,
    handoffIds: [],
    forkedFrom: null,
    pendingBackgroundTasks: [],
    contextUsage: null,
    nativeMetadata: {
      modelSelection: {
        instanceId: instance,
        model: "actual-model",
        options: [{ id: "reasoningEffort", value: "high" }],
      },
    },
    goal: null,
    createdAt: projection.updatedAt,
    updatedAt: projection.updatedAt,
  };
  const actual = executionSnapshot({
    ...projection,
    thread: { ...projection.thread, activeProviderThreadId: id },
    providerThreads: [thread],
  });
  expect(actual?.model).toBe("actual-model");
  expect(actual?.instanceId).toBe(instance);
  expect(actual?.options).toEqual([{ id: "reasoningEffort", value: "high" }]);
});
it("never invents zero quota for an unreadable provider", () => {
  expect(quotaSnapshot(undefined, true, 0)).toEqual({ stale: true, checkedAt: null, windows: [] });
});
it("marks cached quota last known when offline, failed, or stale", () => {
  const limits = {
    checkedAt: "2026-10-26T00:00:00Z",
    windows: [{ id: "primary", label: "Weekly", kind: "weekly" as const, usedPercent: 60 }],
  };
  const now = Date.parse(limits.checkedAt);
  expect(quotaSnapshot(limits, true, now).stale).toBe(false);
  expect(quotaSnapshot(limits, false, now).stale).toBe(true);
  expect(quotaSnapshot(limits, true, now + 601_000).stale).toBe(true);
  expect(
    quotaSnapshot({ ...limits, unavailable: { reason: "probeFailed" } }, true, now).windows,
  ).toEqual(limits.windows);
  expect(
    quotaSnapshot({ ...limits, unavailable: { reason: "unsupported" } }, true, now).windows,
  ).toEqual([]);
});
it("only uses a safe displayName for account aliases", () => {
  expect(accountAlias("小新工作号")).toBe("小新工作号");
  expect(accountAlias("user@example.com")).toBeNull();
  expect(accountAlias(undefined)).toBeNull();
  expect(accountAlias("token=private")).toBeNull();
});
