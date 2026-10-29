import type { WallArtifact } from "@t3tools/contracts";

export function artifactCheckLabel(artifact: WallArtifact): string {
  switch (artifact.verification?.status) {
    case "passed":
      return "检查命令通过";
    case "failed":
      return "检查未通过";
    case "stale":
      return "文件已更新，需重新检查";
    default:
      return "文件已生成 · 未附检查记录";
  }
}

function artifactTime(artifact: WallArtifact) {
  return artifact.modifiedAt ?? artifact.createdAt;
}

export function artifactCounts(artifacts: readonly WallArtifact[]) {
  const counts = { all: artifacts.length, image: 0, video: 0, page: 0, document: 0 };
  for (const a of artifacts) counts[a.kind]++;
  return counts;
}
export interface ArtifactCountState {
  key: string;
  count: number;
}
/** Returns `previous` when nothing changed so React bails out instead of re-rendering in a loop. */
export function nextArtifactCount(
  previous: ArtifactCountState | null,
  key: string,
  count: number,
): ArtifactCountState {
  return previous?.key === key && previous.count === count ? previous : { key, count };
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
    (a, b) => artifactTime(b).localeCompare(artifactTime(a)) || a.id.localeCompare(b.id),
  )) {
    const key = day(new Date(artifactTime(a)));
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
          artifactTime(a) < artifactTime(selected),
      )
      .sort(
        (a, b) => artifactTime(b).localeCompare(artifactTime(a)) || a.id.localeCompare(b.id),
      )[0] ?? null
  );
}
export const ARTIFACT_DRAG_TYPE = "application/x-t3-artifact";

export function isArtifactVideo(artifact: Pick<WallArtifact, "kind">) {
  return artifact.kind === "video";
}
export function artifactVideoDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function artifactRevisionPrompt(artifact: WallArtifact, note: string): string {
  if (!note.trim()) throw new Error("请先填写修改意见");
  return [
    "请按以下批注修改产物：",
    JSON.stringify(
      {
        path: artifact.path,
        sourceThreadId: artifact.threadId,
        revision: artifact.revision ?? null,
        modifiedAt: artifact.modifiedAt ?? artifact.createdAt,
        sizeBytes: artifact.sizeBytes,
      },
      null,
      2,
    ),
    "修改意见：",
    note.trim(),
    "开始前核对本次请求的路径、来源会话与 revision；临时访问 ID 的变化不代表文件变化。无法核对或文件版本已变化时先说明，不猜测旧版内容。",
    "保留原文件，将修改结果另存为新文件。完成后提供原图和新图链接，说明修改与验证情况，等待我对比验收。",
  ].join("\n");
}

/** Capability IDs expire and differ across collectors; they are not file versions. */
export function artifactVersionKey(artifact: WallArtifact): string {
  return JSON.stringify([
    artifact.threadId,
    artifact.path,
    artifact.revision ?? null,
    artifact.modifiedAt ?? artifact.createdAt,
    artifact.sizeBytes,
  ]);
}
