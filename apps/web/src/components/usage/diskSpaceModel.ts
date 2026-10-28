import type { DiskSpaceCategory, DiskSpaceKind, DiskSpaceReport } from "@t3tools/contracts";
import { uiText } from "~/i18n";

export const DISK_SPACE_KINDS: ReadonlyArray<{
  readonly kind: DiskSpaceKind;
  readonly label: string;
  readonly hint: string;
  readonly color: string;
}> = [
  {
    kind: "backups",
    label: uiText("Upgrade backups"),
    hint: uiText("Keep required recovery versions; inspect references before archiving."),
    color: "#d97757",
  },
  {
    kind: "workspaces",
    label: uiText("Task workspaces"),
    hint: uiText("Project copies and installed dependencies created by tasks."),
    color: "#5b9bbd",
  },
  {
    kind: "agent-history",
    label: uiText("Codex history"),
    hint: uiText("Conversation records. Never removed automatically."),
    color: "#8c7bd1",
  },
  {
    kind: "database",
    label: uiText("Chat database"),
    hint: uiText("All your chats live here."),
    color: "#4d9f8a",
  },
  {
    kind: "attachments",
    label: uiText("Attachments"),
    hint: uiText("Files and images attached to messages."),
    color: "#8b8b8b",
  },
  {
    kind: "logs",
    label: uiText("Logs"),
    hint: uiText("Server and provider logs."),
    color: "#b8a24a",
  },
];

export function categoryFor(report: DiskSpaceReport, kind: DiskSpaceKind) {
  return report.categories.find((category) => category.kind === kind);
}

export function overRetentionBackups(category: DiskSpaceCategory | undefined) {
  return category?.items.filter((item) => item.overRetention) ?? [];
}

export function overRetentionBytes(category: DiskSpaceCategory | undefined): number | null {
  const sizes = overRetentionBackups(category).map((item) => item.bytes);
  if (sizes.length === 0) return 0;
  const known = sizes.filter((size): size is number => size !== null);
  return known.length === 0 ? null : known.reduce((total, size) => total + size, 0);
}

export interface DiskSpaceGrowth {
  readonly days: number;
  /** Negative when free space shrank. */
  readonly freeBytesChange: number | null;
  readonly fastest: { readonly kind: DiskSpaceKind; readonly bytesChange: number } | null;
}

/** Compares the two newest daily samples; null until a second day has been measured. */
export function summarizeGrowth(history: DiskSpaceReport["history"]): DiskSpaceGrowth | null {
  const current = history.at(-1);
  const previous = history.at(-2);
  if (current === undefined || previous === undefined) return null;
  const days = Math.max(1, Math.round((Date.parse(current.at) - Date.parse(previous.at)) / 864e5));
  let fastest: DiskSpaceGrowth["fastest"] = null;
  for (const { kind } of DISK_SPACE_KINDS) {
    const before = previous.bytesByKind[kind];
    const after = current.bytesByKind[kind];
    if (before === undefined || after === undefined) continue;
    const bytesChange = after - before;
    if (bytesChange > 0 && (fastest === null || bytesChange > fastest.bytesChange)) {
      fastest = { kind, bytesChange };
    }
  }
  return {
    days,
    freeBytesChange:
      current.freeBytes !== null && previous.freeBytes !== null
        ? current.freeBytes - previous.freeBytes
        : null,
    fastest,
  };
}

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * A copy-only command: it never deletes the original, so the user can check the copy before
 * removing anything.
 */
export function backupCopyCommand(paths: ReadonlyArray<string>): string {
  const destination = "/Volumes/<external-drive>/T3-backups/";
  return [
    `mkdir -p ${shellQuote(destination)}`,
    ...paths.map((path) => `rsync -a ${shellQuote(path)} ${shellQuote(destination)}`),
  ].join("\n");
}

export function daysSince(iso: string | null, now: number): number | null {
  if (iso === null) return null;
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : Math.max(0, Math.floor((now - time) / 864e5));
}
