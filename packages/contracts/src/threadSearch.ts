import * as Schema from "effect/Schema";

import {
  IsoDateTime,
  MessageId,
  ProjectId,
  ThreadId,
  TrimmedNonEmptyString,
  TrimmedString,
} from "./baseSchemas.ts";

export const OrchestrationThreadSearchSource = Schema.Literals(["user", "assistant"]);
export type OrchestrationThreadSearchSource = typeof OrchestrationThreadSearchSource.Type;

// The server's SQLite client is synchronous and single-connection. Bound both
// scan input and response size so a search cannot monopolize that connection.
export const OrchestrationSearchThreadsInput = Schema.Struct({
  searchMode: Schema.optionalKey(Schema.Literal("spotlight")),
  query: TrimmedString.check(Schema.isMinLength(2), Schema.isMaxLength(200)),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))),
});
export type OrchestrationSearchThreadsInput = typeof OrchestrationSearchThreadsInput.Type;

export const OrchestrationThreadSearchMatch = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  source: OrchestrationThreadSearchSource,
  snippet: Schema.String.check(Schema.isMaxLength(240)),
  messageCreatedAt: Schema.NullOr(IsoDateTime),
  messageId: Schema.optionalKey(MessageId),
  title: Schema.optionalKey(Schema.String),
  archivedAt: Schema.optionalKey(Schema.NullOr(IsoDateTime)),
  score: Schema.optionalKey(Schema.Number),
  matchedQuery: Schema.optionalKey(Schema.String),
  familyKey: Schema.optionalKey(Schema.String),
  familyTitle: Schema.optionalKey(Schema.String),
  familyThreads: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        threadId: ThreadId,
        title: Schema.String,
        updatedAt: IsoDateTime,
        archivedAt: Schema.NullOr(IsoDateTime),
      }),
    ),
  ),
  isSubagent: Schema.optionalKey(Schema.Boolean),
});
export type OrchestrationThreadSearchMatch = typeof OrchestrationThreadSearchMatch.Type;

export const OrchestrationSearchThreadsResult = Schema.Struct({
  matches: Schema.Array(OrchestrationThreadSearchMatch),
});
export type OrchestrationSearchThreadsResult = typeof OrchestrationSearchThreadsResult.Type;

export class OrchestrationSearchThreadsError extends Schema.TaggedError<OrchestrationSearchThreadsError>()(
  "OrchestrationSearchThreadsError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
