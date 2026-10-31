import { useId, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  SquareIcon,
  ShieldQuestionIcon,
} from "lucide-react";
import type { TaskProgressSnapshot } from "../../taskProgress";
import { uiText } from "~/i18n";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

export const taskProgressStateLabels: Record<TaskProgressSnapshot["state"], string> = {
  loading: "Loading steps…",
  empty: "No plan reported",
  running: "In progress",
  waiting: "Waiting",
  approval: "Waiting for approval",
  input: "Waiting for your answer",
  stopped: "Stopped",
  failed: "Needs attention",
  complete: "Plan complete",
  incomplete: "Steps unfinished",
  queued: "Queued",
};

export function progressTone(progress: TaskProgressSnapshot) {
  if (progress.stale) return "text-muted-foreground";
  switch (progress.state) {
    case "approval":
    case "input":
      return "text-warning";
    case "failed":
      return "text-destructive";
    case "complete":
      return "text-success";
    case "running":
      return "text-primary";
    default:
      return "text-muted-foreground";
  }
}

function StepMark({
  completed,
  current,
  progress,
}: {
  completed: boolean;
  current: boolean;
  progress: TaskProgressSnapshot;
}) {
  if (completed) return <CheckIcon aria-hidden className="size-3 text-success" />;
  if (!current) return <span aria-hidden className="size-1.5 rounded-full bg-border" />;
  if (progress.state === "approval") return <ShieldQuestionIcon aria-hidden className="size-3" />;
  if (progress.state === "failed") return <CircleAlertIcon aria-hidden className="size-3" />;
  if (progress.state === "stopped") return <SquareIcon aria-hidden className="size-2.5" />;
  return <span aria-hidden className="size-1.5 rounded-full bg-current" />;
}

export function TaskProgressSteps({
  progress,
  compact = false,
}: {
  progress: TaskProgressSnapshot;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const listId = useId();
  const currentIndex = progress.steps.findIndex((step) => step.status === "running");
  const nextIndex = progress.steps.findIndex((step) => step.status === "pending");
  const anchorIndex = currentIndex >= 0 ? currentIndex : nextIndex >= 0 ? nextIndex : 0;
  const start = compact ? Math.max(0, Math.min(anchorIndex - 1, progress.steps.length - 5)) : 0;
  const shown = compact ? progress.steps.slice(start, start + 5) : progress.steps;
  const hiddenAfter = progress.total - start - shown.length;
  const tone = progressTone(progress);
  const stateLabel = uiText(
    progress.stale ? "Status may be out of date" : taskProgressStateLabels[progress.state],
  );
  return (
    <section
      aria-label={uiText("Task progress")}
      className={cn("min-w-0", compact ? "text-3xs" : "text-xs")}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded(!expanded)}
        className="flex w-full min-w-0 items-center gap-1.5 rounded-sm py-1 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {expanded ? (
          <ChevronDownIcon aria-hidden className="size-3 shrink-0" />
        ) : (
          <ChevronRightIcon aria-hidden className="size-3 shrink-0" />
        )}
        <span className="font-medium">{uiText("Task steps")}</span>{" "}
        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
          {progress.total > 0
            ? uiText("{completed}/{total} completed", {
                completed: progress.completed,
                total: progress.total,
              })
            : null}
        </span>
      </button>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 pb-2 pl-4.5">
        <span className={tone}>{stateLabel}</span>
        {progress.remaining > 0 ? (
          <span className="text-muted-foreground">
            {uiText("{count} remaining (including current)", { count: progress.remaining })}
          </span>
        ) : null}
      </div>
      <div id={listId} hidden={!expanded}>
        {progress.steps.length === 0 ? (
          <p className="pl-4.5 leading-relaxed text-muted-foreground">
            {uiText(
              progress.state === "loading"
                ? "Waiting for task details."
                : "No steps reported for this turn.",
            )}
          </p>
        ) : (
          <ol aria-label={uiText("Reported task steps")} className="space-y-0">
            {start > 0 ? (
              <li className="pb-2 pl-4.5 text-muted-foreground">
                {uiText("{count} earlier steps", { count: start })}
              </li>
            ) : null}
            {shown.map((step, index) => {
              const completed = step.status === "completed";
              const current = step.status === "running";
              const stepLabel = completed
                ? uiText("Completed")
                : current
                  ? stateLabel
                  : uiText("Not started");
              const text = (
                <p
                  dir="auto"
                  className={cn(
                    "wrap-anywhere leading-relaxed",
                    compact && "line-clamp-2",
                    current ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.text}
                </p>
              );
              return (
                <li
                  key={step.id}
                  className="relative flex min-w-0 gap-2 pb-3 last:pb-1"
                  aria-current={current ? "step" : undefined}
                >
                  {index < shown.length - 1 ? (
                    <span aria-hidden className="absolute top-4 bottom-0 left-1.5 w-px bg-border" />
                  ) : null}
                  <span
                    className={cn(
                      "relative flex size-3.5 shrink-0 items-center justify-center pt-0.5",
                      current ? tone : "text-muted-foreground",
                    )}
                  >
                    <StepMark completed={completed} current={current} progress={progress} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {compact ? (
                      <Tooltip>
                        <TooltipTrigger render={text} />
                        <TooltipPopup side="right">{step.text}</TooltipPopup>
                      </Tooltip>
                    ) : (
                      text
                    )}
                    <p
                      className={cn(
                        compact ? "sr-only" : "mt-0.5 text-3xs",
                        current ? tone : "text-muted-foreground",
                      )}
                    >
                      {stepLabel}
                    </p>
                  </div>
                </li>
              );
            })}
            {hiddenAfter > 0 ? (
              <li className="pl-5.5 text-muted-foreground">
                {uiText("{count} later steps", { count: hiddenAfter })}
              </li>
            ) : null}
          </ol>
        )}
        {!compact && progress.state === "incomplete" ? (
          <p className="mt-2 text-muted-foreground">
            {uiText("This turn ended with unfinished steps.")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
