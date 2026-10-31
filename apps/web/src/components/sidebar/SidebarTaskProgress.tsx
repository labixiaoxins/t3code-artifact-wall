import type { ScopedThreadRef } from "@t3tools/contracts";
import { useQuietThreadProjection, useThreadShell } from "../../state/entities";
import { useEnvironment } from "../../state/environments";
import { taskProgressSnapshot } from "../../taskProgress";
import { useInspectorTab } from "../../inspectorTabs";
import { useRightPanelStore } from "../../rightPanelStore";
import { uiText } from "../../i18n";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { progressTone, taskProgressStateLabels } from "../chat/TaskProgressSteps";

/** One-line summary; the full step list lives in the Run tab so the sidebar never reflows. */
export function SidebarTaskProgress({ threadRef }: { threadRef: ScopedThreadRef }) {
  const projection = useQuietThreadProjection(threadRef)?.projection ?? null;
  const shell = useThreadShell(threadRef);
  const environment = useEnvironment(threadRef.environmentId);
  const [, setInspectorTab] = useInspectorTab();
  const progress = taskProgressSnapshot(
    projection,
    shell,
    environment?.connection.phase === "connected",
  );
  if (progress.total === 0) return null;
  const stateLabel = uiText(
    progress.stale ? "Status may be out of date" : taskProgressStateLabels[progress.state],
  );
  const current = progress.steps.find((step) => step.status === "running")?.text;
  const percent = Math.round((progress.completed / progress.total) * 100);
  const button = (
    <button
      type="button"
      aria-label={`${uiText("{completed}/{total} completed", {
        completed: progress.completed,
        total: progress.total,
      })} · ${stateLabel} · ${uiText("View full progress")}`}
      className="mx-2 mb-1.5 block w-[calc(100%-1rem)] min-w-0 rounded px-1.5 py-1 text-left text-3xs outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        setInspectorTab("run");
        const panel = useRightPanelStore.getState();
        panel.setThreadPanelOpen(threadRef, "inline", true);
        panel.setThreadPanelOpen(threadRef, "popover", true);
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="shrink-0 tabular-nums text-sidebar-muted-foreground">
          {progress.completed}/{progress.total}
        </span>
        <span className={cn("min-w-0 truncate", progressTone(progress))}>{stateLabel}</span>
      </span>
      <span aria-hidden className="mt-1 block h-0.5 overflow-hidden rounded-full bg-sidebar-border">
        <span
          className={cn("block h-full rounded-full bg-current", progressTone(progress))}
          style={{ width: `${percent}%` }}
        />
      </span>
    </button>
  );
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{current ? `${stateLabel}：${current}` : stateLabel}</TooltipPopup>
    </Tooltip>
  );
}
