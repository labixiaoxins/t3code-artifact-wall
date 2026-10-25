import * as Schema from "effect/Schema";

export const WallArtifactVerification = Schema.Struct({
  status: Schema.Literals(["unverified", "passed", "failed", "stale"]),
  label: Schema.optional(Schema.String),
  checkedAt: Schema.optional(Schema.String),
  evidenceItemId: Schema.optional(Schema.String),
});
export type WallArtifactVerification = typeof WallArtifactVerification.Type;

export const WallArtifact = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  path: Schema.String,
  name: Schema.String,
  extension: Schema.String,
  kind: Schema.Literals(["image", "video", "page", "document"]),
  source: Schema.Literals(["attachment", "html", "file_change", "path_reference"]),
  createdAt: Schema.String,
  sizeBytes: Schema.Number,
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  revision: Schema.optional(Schema.String),
  modifiedAt: Schema.optional(Schema.String),
  verification: Schema.optional(WallArtifactVerification),
});
export type WallArtifact = typeof WallArtifact.Type;
export const WallArtifactList = Schema.Struct({ artifacts: Schema.Array(WallArtifact) });
