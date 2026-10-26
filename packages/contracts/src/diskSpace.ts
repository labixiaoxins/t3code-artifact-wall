import * as Schema from "effect/Schema";

/** What the Usage → Disk page groups on-disk data by. */
export const DiskSpaceKind = Schema.Literals([
  "backups",
  "workspaces",
  "agent-history",
  "database",
  "attachments",
  "logs",
]);
export type DiskSpaceKind = typeof DiskSpaceKind.Type;

export const DiskSpaceItem = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  /** Allocated bytes, or null when the measurement timed out or is unsupported. */
  bytes: Schema.NullOr(Schema.Number),
  modifiedAt: Schema.NullOr(Schema.String),
  /** Set on a backup that falls outside the newest-N the retention rule keeps. */
  overRetention: Schema.Boolean,
});
export type DiskSpaceItem = typeof DiskSpaceItem.Type;

export const DiskSpaceCategory = Schema.Struct({
  kind: DiskSpaceKind,
  path: Schema.String,
  bytes: Schema.NullOr(Schema.Number),
  /** Largest entries first, except backups, which are newest first. */
  items: Schema.Array(DiskSpaceItem),
  /** Entries beyond `items` that were summed into `bytes` but not listed. */
  unlistedItemCount: Schema.Number,
});
export type DiskSpaceCategory = typeof DiskSpaceCategory.Type;

export const DiskSpaceSample = Schema.Struct({
  at: Schema.String,
  freeBytes: Schema.NullOr(Schema.Number),
  bytesByKind: Schema.Record(Schema.String, Schema.Number),
});
export type DiskSpaceSample = typeof DiskSpaceSample.Type;

export const DiskSpaceReport = Schema.Struct({
  measuredAt: Schema.String,
  /** True while a measurement is still running; sizes may be null or from an earlier pass. */
  measuring: Schema.Boolean,
  volume: Schema.NullOr(Schema.Struct({ freeBytes: Schema.Number, totalBytes: Schema.Number })),
  categories: Schema.Array(DiskSpaceCategory),
  /** How many of the newest backups the retention rule keeps. */
  backupsToKeep: Schema.Number,
  /** One sample per measurement day, oldest first, bounded by the server. */
  history: Schema.Array(DiskSpaceSample),
});
export type DiskSpaceReport = typeof DiskSpaceReport.Type;

export const DiskSpaceInput = Schema.Struct({
  /** Skip the cached measurement. Measuring walks large directories, so the default reuses it. */
  refresh: Schema.optionalKey(Schema.Boolean),
  /** Wait for the running measurement instead of returning the cached or placeholder report. */
  awaitMeasurement: Schema.optionalKey(Schema.Boolean),
});
export type DiskSpaceInput = typeof DiskSpaceInput.Type;
