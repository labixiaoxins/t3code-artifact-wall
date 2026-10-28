import { type CSSProperties, type ReactNode, useId, useState } from "react";
import * as Schema from "effect/Schema";

import { useLocalStorage } from "~/hooks/useLocalStorage";
import { useResizeDrag } from "~/hooks/useResizeDrag";
import { uiText } from "~/i18n";
import { cn } from "~/lib/utils";
import { Tooltip, TooltipTrigger, TooltipPopup } from "~/components/ui/tooltip";

const DEFAULT_HEIGHT = 96;
const MIN_HEIGHT = 80;
const MAX_HEIGHT = 480;
const STORAGE_KEY = "t3code:composer-input-height:v1";

export function ResizableComposerInput({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const editorId = useId();
  const [savedHeight, saveHeight] = useLocalStorage(STORAGE_KEY, DEFAULT_HEIGHT, Schema.Number);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const height = Math.max(
    MIN_HEIGHT,
    Math.min(MAX_HEIGHT, Number.isFinite(savedHeight) ? savedHeight : DEFAULT_HEIGHT),
  );
  const bounds = () => ({
    min: MIN_HEIGHT,
    max: Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.floor(window.innerHeight * 0.45))),
  });
  const clamp = (next: number) => Math.max(bounds().min, Math.min(bounds().max, next));
  const drag = useResizeDrag<HTMLButtonElement>((event) => {
    const editor = event.currentTarget.parentElement?.querySelector(".composer-tiptap");
    return {
      axis: "y",
      edge: "left",
      width: editor?.getBoundingClientRect().height ?? clamp(height),
      bounds: bounds(),
      resize: (next) => {
        const clamped = clamp(next);
        setDragHeight(clamped);
        return clamped;
      },
      finish: (next, moved) => {
        if (moved) saveHeight(clamp(next));
        setDragHeight(null);
      },
      cleanup: (committed) => {
        if (!committed) setDragHeight(null);
      },
    };
  });
  if (!enabled) return children;
  return (
    <div
      className={cn(
        "relative",
        enabled &&
          "[&_.composer-tiptap]:min-h-[min(var(--composer-input-height),45dvh)] [&_.composer-tiptap]:max-h-[min(max(var(--composer-input-height),13rem),45dvh)]",
      )}
      style={{ "--composer-input-height": `${dragHeight ?? height}px` } as CSSProperties}
    >
      {enabled && (
        <Tooltip>
          <TooltipTrigger
            render={<button type="button" />}
            role="separator"
            aria-label={uiText("Resize message input")}
            aria-orientation="horizontal"
            aria-controls={editorId}
            aria-valuemin={MIN_HEIGHT}
            aria-valuemax={MAX_HEIGHT}
            aria-valuenow={dragHeight ?? height}
            className="group absolute -top-3 left-1/2 z-20 flex h-6 w-24 -translate-x-1/2 cursor-row-resize touch-none items-center justify-center rounded-md focus-visible:outline-2 focus-visible:outline-primary"
            {...drag}
            onDoubleClick={() => saveHeight(DEFAULT_HEIGHT)}
            onKeyDown={(event) => {
              const delta = { ArrowUp: 16, ArrowDown: -16, PageUp: 64, PageDown: -64 }[event.key];
              if (delta === undefined && event.key !== "Home" && event.key !== "End") return;
              event.preventDefault();
              event.stopPropagation();
              saveHeight(
                event.key === "Home"
                  ? DEFAULT_HEIGHT
                  : event.key === "End"
                    ? bounds().max
                    : clamp(height + (delta ?? 0)),
              );
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none h-1 w-8 rounded-full bg-border group-hover:bg-muted-foreground group-focus-visible:bg-muted-foreground"
            />
          </TooltipTrigger>
          <TooltipPopup side="top">
            {uiText("Drag to resize; double-click or press Home to reset")}
          </TooltipPopup>
        </Tooltip>
      )}
      <div id={editorId}>{children}</div>
    </div>
  );
}
