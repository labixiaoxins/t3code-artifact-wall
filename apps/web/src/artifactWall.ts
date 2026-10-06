import type { WallArtifact } from "@t3tools/contracts";

export function artifactCounts(artifacts: readonly WallArtifact[]) {
  const counts = { all: artifacts.length, image: 0, page: 0, document: 0 };
  for (const a of artifacts) counts[a.kind]++;
  return counts;
}
export function groupArtifacts(artifacts: readonly WallArtifact[], now = new Date()) {
  const day = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const today = day(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = day(yesterdayDate);
  const groups = new Map<string, { label: string; artifacts: WallArtifact[] }>();
  for (const a of [...artifacts].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  )) {
    const key = day(new Date(a.createdAt));
    const group = groups.get(key) ?? {
      label: key === today ? "今天" : key === yesterday ? "昨天" : key,
      artifacts: [],
    };
    group.artifacts.push(a);
    groups.set(key, group);
  }
  return [...groups.values()];
}
export function previousArtifactImage(selected: WallArtifact, artifacts: readonly WallArtifact[]) {
  return (
    artifacts
      .filter(
        (a) =>
          a.kind === "image" &&
          a.threadId === selected.threadId &&
          a.id !== selected.id &&
          a.createdAt < selected.createdAt,
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))[0] ?? null
  );
}
export const ARTIFACT_DRAG_TYPE = "application/x-t3-artifact";

export function isArtifactVideo(artifact: Pick<WallArtifact, "extension">) {
  return artifact.extension === "mp4";
}
export function artifactVideoDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
