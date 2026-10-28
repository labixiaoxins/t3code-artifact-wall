import { InboxStatusMark } from "./InboxStatusMark";
import { useThreadShells } from "../../state/entities";
import { useWorkbenchInboxStore } from "../../workbenchInboxStore";
import { inboxThreadKey } from "../../workbenchInbox";
import { groupAttentionCounts } from "../../sidebarInboxPresentation";

export function InboxGroupBadge({
  threadKeys,
  fallbackCount,
}: {
  threadKeys: ReadonlySet<string> | undefined;
  fallbackCount?: number;
}) {
  const threads = useThreadShells();
  const acknowledged = useWorkbenchInboxStore((state) => state.acknowledgedErrors);
  const counts = groupAttentionCounts(
    threads.filter((thread) => threadKeys?.has(inboxThreadKey(thread))),
    acknowledged,
  );
  if (!counts.requests && !counts.errors) {
    return fallbackCount === undefined ? null : (
      <span className="ml-auto text-xs text-muted-foreground">{fallbackCount}</span>
    );
  }
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1 text-xs tabular-nums">
      {counts.requests ? (
        <span
          className="inline-flex items-center gap-1 text-primary"
          aria-label={`待授权或待回答 ${counts.requests}`}
        >
          <InboxStatusMark reason="待授权" /> {counts.requests}
        </span>
      ) : null}
      {counts.errors ? (
        <span
          className="inline-flex items-center gap-1 text-destructive"
          aria-label={`未知悉失败 ${counts.errors}`}
        >
          <InboxStatusMark reason="运行失败" /> {counts.errors}
        </span>
      ) : null}
    </span>
  );
}
