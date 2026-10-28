import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { OrchestrationV2AppThreadLineage, ThreadId } from "./index.ts";
import {
  OrchestrationV2AppThreadJson,
  OrchestrationV2DomainEventJson,
  OrchestrationV2Command,
} from "./orchestrationV2.ts";

const decodeLineage = Schema.decodeUnknownSync(OrchestrationV2AppThreadLineage);
const decodeCommand = Schema.decodeSync(OrchestrationV2Command);
// Local customization guard: the handoff link must never widen lineage, because
// official clients decode the whole thread-shell list with these strict literals.
describe("continuation link compatibility", () => {
  const lineage = {
    parentThreadId: null,
    relationshipToParent: null,
    rootThreadId: ThreadId.make("new-thread"),
  };

  it("keeps the official lineage literals", () => {
    expect(() =>
      decodeLineage({
        ...lineage,
        relationshipToParent: "continuation",
      }),
    ).toThrow();
  });

  it("is ignored by a decoder that predates the field", () => {
    const officialShellSubset = Schema.Struct({
      id: ThreadId,
      lineage: OrchestrationV2AppThreadLineage,
    });
    const decoded = Schema.decodeUnknownSync(officialShellSubset)({
      id: "new-thread",
      lineage,
      continuedFromThreadId: "old-thread",
    });
    expect(decoded.lineage).toEqual(lineage);
  });

  it("preserves continuation identity through a full thread and event round trip", () => {
    const original: unknown = {
      createdBy: "user",
      creationSource: "web",
      id: "new-thread",
      projectId: "project-1",
      title: "Continued work",
      providerInstanceId: "codex",
      modelSelection: { instanceId: "codex", model: "gpt-6.1-sol" },
      runtimeMode: "approval-required",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage,
      continuedFromThreadId: "old-thread",
      forkedFrom: null,
      createdAt: "2026-10-18T00:00:00.000Z",
      updatedAt: "2026-10-18T00:00:00.000Z",
      archivedAt: null,
      deletedAt: null,
    };
    const decode = Schema.decodeUnknownSync(OrchestrationV2AppThreadJson);
    const encode = Schema.encodeSync(OrchestrationV2AppThreadJson);
    const first = decode(original);
    const saved = encode({ ...first, title: "Updated title" });
    const reloaded = decode(JSON.parse(JSON.stringify(saved)));
    expect(reloaded.continuedFromThreadId).toBe("old-thread");
    expect(reloaded.lineage).toEqual(lineage);
    expect(reloaded.title).toBe("Updated title");
    const decodeEvent = Schema.decodeUnknownSync(OrchestrationV2DomainEventJson);
    const event = decodeEvent({
      id: "event-1",
      type: "thread.created",
      threadId: "new-thread",
      occurredAt: "2026-10-18T00:00:00.000Z",
      payload: saved,
    });
    if (event.type !== "thread.created") throw new Error("wrong event type");
    expect(event.payload.continuedFromThreadId).toBe("old-thread");
  });

  it("preserves continuation source in a full create command", () => {
    const command = decodeCommand({
      type: "thread.create",
      createdBy: "user",
      creationSource: "web",
      commandId: "create-continued",
      threadId: "new-thread",
      projectId: "project-1",
      title: "Continued work",
      modelSelection: { instanceId: "codex", model: "gpt-6.1-sol" },
      runtimeMode: "approval-required",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      continuationOfThreadId: "old-thread",
    });
    if (command.type !== "thread.create") throw new Error("wrong command");
    expect(command.continuationOfThreadId).toBe("old-thread");
  });
});
