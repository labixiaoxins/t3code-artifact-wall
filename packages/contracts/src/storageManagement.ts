import * as Schema from "effect/Schema";

export const StorageOperation = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  phase: Schema.String,
  createdAt: Schema.String,
  held: Schema.optionalKey(Schema.String),
  source: Schema.optionalKey(Schema.String),
  archive: Schema.optionalKey(Schema.String),
  destination: Schema.optionalKey(Schema.String),
  release: Schema.optionalKey(Schema.Boolean),
  cancelRequested: Schema.optionalKey(Schema.Boolean),
  warnings: Schema.optionalKey(Schema.Array(Schema.String)),
  sourceBytes: Schema.Number,
  reserveGiB: Schema.optionalKey(Schema.Number),
  freeBefore: Schema.optionalKey(Schema.Number),
  freeAfter: Schema.optionalKey(Schema.Number),
  error: Schema.optionalKey(Schema.String),
});
export type StorageOperation = typeof StorageOperation.Type;
export const StorageInspection = Schema.Struct({
  checkedAt: Schema.String,
  entries: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      path: Schema.String,
      kind: Schema.String,
      reason: Schema.String,
      canRelease: Schema.Boolean,
      bytes: Schema.optionalKey(Schema.NullOr(Schema.Number)),
    }),
  ),
  archives: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      path: Schema.String,
      source: Schema.String,
      online: Schema.Boolean,
      bytes: Schema.Number,
      restorable: Schema.Boolean,
    }),
  ),
  volumes: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      path: Schema.String,
      freeBytes: Schema.Number,
    }),
  ),
  operations: Schema.Array(StorageOperation),
});
export type StorageInspection = typeof StorageInspection.Type;
export const StorageInspectInput = Schema.Struct({
  objectId: Schema.optionalKey(Schema.String),
  measureSizes: Schema.optionalKey(Schema.Boolean),
  statusOnly: Schema.optionalKey(Schema.Boolean),
});
export type StorageInspectInput = typeof StorageInspectInput.Type;
export const StorageActionInput = Schema.Union([
  Schema.Struct({
    action: Schema.Literals(["plan"]),
    objectId: Schema.String,
    volumeId: Schema.String,
    mode: Schema.Literals(["archive-only", "archive-and-release"]),
  }),
  Schema.Struct({
    action: Schema.Literals(["restore-plan"]),
    objectId: Schema.String,
    volumeId: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    action: Schema.Literals(["execute", "cancel", "reconcile"]),
    planId: Schema.String,
  }),
]);
export type StorageActionInput = typeof StorageActionInput.Type;
export class StorageManagementError extends Schema.TaggedError<StorageManagementError>()(
  "StorageManagementError",
  { message: Schema.String },
) {}
