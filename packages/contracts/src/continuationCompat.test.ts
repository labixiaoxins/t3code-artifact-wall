import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";

import { OrchestrationV2AppThreadLineage, ThreadId } from "./index.ts";

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
      Schema.decodeUnknownSync(OrchestrationV2AppThreadLineage)({
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
});
