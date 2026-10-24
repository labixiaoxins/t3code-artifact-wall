import { uiText } from "~/i18n";
import type { RuntimeMode } from "@t3tools/contracts";
import { type LucideIcon, LockIcon, LockOpenIcon, PenLineIcon, SparklesIcon } from "lucide-react";

export const runtimeModeConfig: Record<
  RuntimeMode,
  { label: string; description: string; icon: LucideIcon }
> = {
  "approval-required": {
    label: uiText("Supervised"),
    description: uiText("Ask before commands and file changes."),
    icon: LockIcon,
  },
  "auto-accept-edits": {
    label: uiText("Auto-accept edits"),
    description: uiText("Auto-approve edits, ask before other actions."),
    icon: PenLineIcon,
  },
  auto: {
    label: uiText("Auto"),
    description: uiText("Supported providers approve routine actions; others still ask."),
    icon: SparklesIcon,
  },
  "full-access": {
    label: uiText("Full access"),
    description: uiText("Allow commands and edits without prompts."),
    icon: LockOpenIcon,
  },
};

export const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];
