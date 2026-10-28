import { uiText } from "~/i18n";
import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import type { UsageChartMetric } from "./UsageProviderChart";
import { resolveShortcutCommand, type ShortcutEventLike } from "../../keybindings";

export type UsageMetric = UsageChartMetric | "limits" | "disk";
export const METRIC_OPTIONS = [
  { value: "cost", label: uiText("Cost"), command: "usage.cost" },
  { value: "tokens", label: uiText("Tokens"), command: "usage.tokens" },
  { value: "limits", label: uiText("Limits"), command: "usage.limits" },
  { value: "disk", label: uiText("Disk"), command: "usage.disk" },
] as const satisfies readonly { value: UsageMetric; label: string; command: KeybindingCommand }[];

export const WINDOW_OPTIONS = [
  { days: 1, label: uiText("Past 24h"), command: "usage.period.day" },
  { days: 7, label: uiText("7 days"), command: "usage.period.week" },
  { days: 30, label: uiText("30 days"), command: "usage.period.month" },
  { days: 90, label: uiText("90 days"), command: "usage.period.quarter" },
] as const;

export function resolveUsageShortcut(
  event: ShortcutEventLike & { target: EventTarget | null },
  keybindings: ResolvedKeybindingsConfig,
) {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable ||
      target.closest(
        '[role="dialog"]:not([data-app-modal]), [aria-modal="true"]:not([data-app-modal]), [data-slot$="popup"]:not([data-app-modal])',
      ))
  ) {
    return null;
  }

  return resolveShortcutCommand(event, keybindings, {
    context: { usagePageOpen: true },
  });
}
