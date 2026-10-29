import type { StorageInspection } from "@t3tools/contracts";

export type StorageTab = "candidates" | "backups" | "protected" | "history";
export type StorageEntry = StorageInspection["entries"][number];
export function storageTabFor(entry: StorageEntry): StorageTab {
  if (entry.kind === "backups") return "backups";
  if (["protected", "database", "attachments", "agent-history"].includes(entry.kind))
    return "protected";
  return "candidates";
}
export function storageReleaseEstimate(entries: ReadonlyArray<StorageEntry>) {
  const eligible = entries.filter((entry) => entry.canRelease);
  // A workspace includes its descendants; overlapping sizes cannot be added twice.
  const roots = eligible.filter(
    (entry) =>
      !eligible.some((other) => other !== entry && entry.path.startsWith(other.path + "/")),
  );
  return {
    count: roots.length,
    bytes: roots.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0),
    incomplete: roots.some((entry) => entry.bytes == null),
  };
}
export function filterStorageEntries(
  entries: ReadonlyArray<StorageEntry>,
  tab: StorageTab,
  volumePath: string,
  search: string,
) {
  const query = search.trim().toLocaleLowerCase();
  return entries
    .filter(
      (entry) =>
        storageTabFor(entry) === tab &&
        (!volumePath || entry.volumePath === volumePath) &&
        (!query || (entry.name + " " + entry.path).toLocaleLowerCase().includes(query)),
    )
    .toSorted((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1) || a.name.localeCompare(b.name));
}
