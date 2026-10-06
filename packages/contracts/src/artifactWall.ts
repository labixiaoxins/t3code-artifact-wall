import * as Schema from "effect/Schema";

export const WallArtifact = Schema.Struct({
  id: Schema.String,
  threadId: Schema.String,
  path: Schema.String,
  name: Schema.String,
  extension: Schema.String,
  kind: Schema.Literals(["image", "page", "document"]),
  source: Schema.Literals(["attachment", "html", "file_change", "path_reference"]),
  createdAt: Schema.String,
  sizeBytes: Schema.Number,
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
});
export type WallArtifact = typeof WallArtifact.Type;
export const WallArtifactList = Schema.Struct({ artifacts: Schema.Array(WallArtifact) });
