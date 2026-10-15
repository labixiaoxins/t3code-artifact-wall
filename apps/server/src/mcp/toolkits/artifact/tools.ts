import { OrchestratorMcpFailure, WallArtifact, WallArtifactVerification } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";
import * as ArtifactWall from "../../../artifacts/ArtifactWall.ts";
import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

const common = {
  failure: OrchestratorMcpFailure,
  failureMode: "return" as const,
  dependencies: [
    ArtifactWall.ArtifactWall,
    ThreadManagementService.ThreadManagementService,
    McpInvocationContext.McpInvocationContext,
  ],
};
const ArtifactList = Tool.make("artifact_list", {
  ...common,
  description:
    "List existing deliverable files referenced by this thread, with their current revision and recorded checks. Follow nextOffset for more files (default 40 per page). This does not scan other projects. A file existing is not a passed check or user acceptance. Use the exact path and revision when recording a check.",
  parameters: Schema.Struct({
    offset: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    limit: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
  }),
  success: Schema.Struct({
    artifacts: Schema.Array(WallArtifact),
    nextOffset: Schema.NullOr(Schema.Int),
  }),
})
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Destructive, false);

const ArtifactRecordCheck = Tool.make("artifact_record_check", {
  ...common,
  description:
    "Attach a real completed command record to a deliverable from artifact_list. Run the relevant check first, then obtain its durable itemId with t3_thread_read(view=activity). The server verifies the command belongs to this thread, has a terminal exit code, and finished after the file's last modification. It hashes the file and derives passed/failed from the command; later file changes expire this record. This records the agent's specified check, not user approval, deployment, or proof that every requirement passed. Retry with the same file revision and evidence item; do not rerun an external operation just to create a receipt.",
  parameters: Schema.Struct({
    path: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
    revision: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
    label: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160)),
    evidenceItemId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(4096)),
  }),
  success: WallArtifactVerification,
})
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.Idempotent, true);

export const ArtifactToolkit = Toolkit.make(ArtifactList, ArtifactRecordCheck);
