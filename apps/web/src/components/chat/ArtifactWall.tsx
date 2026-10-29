import { uiText } from "~/i18n";
import { usePreparedConnection } from "../../state/session";
import type { EnvironmentId, ThreadId, WallArtifact } from "@t3tools/contracts";
import { useEffect, useRef, useState } from "react";
import { FileIcon, GlobeIcon, XIcon } from "lucide-react";
import {
  artifactCounts,
  artifactCheckLabel,
  isArtifactVideo,
  artifactVideoDuration,
  groupArtifacts,
  ARTIFACT_DRAG_TYPE,
  artifactRevisionPrompt,
  artifactVersionKey,
} from "../../artifactWall";
import { artifactFileUrl, fileFromArtifact, loadWallArtifacts } from "../../lib/artifactWallClient";
import { useAtomCommand } from "../../state/use-atom-command";
import { shellEnvironment } from "../../state/shell";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "~/lib/utils";
import { Dialog, DialogPopup, DialogTitle } from "../ui/dialog";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

export function ArtifactWall({
  environmentId,
  threadId,
  onAttach,
  onRevise,
  active = true,
  onCount,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  onAttach: (files: File[]) => void;
  onRevise?: (prompt: string) => boolean;
  /** An inactive wall keeps loading (for the tab count) but renders nothing, so no thumbnails load. */
  active?: boolean;
  onCount?: (count: number) => void;
}) {
  const preparedConnection = usePreparedConnection(environmentId);
  const [scope, setScope] = useState<"thread" | "project">("thread");
  const [filter, setFilter] = useState<"all" | WallArtifact["kind"]>("all");
  const [state, setState] = useState<{
    key: string;
    artifacts: readonly WallArtifact[];
    error: string | null;
    loading: boolean;
  }>({ key: "", artifacts: [], error: null, loading: true });
  const [durations, setDurations] = useState<Record<string, number>>({});
  const [visible, setVisible] = useState(40);
  const [selected, setSelected] = useState<WallArtifact | null>(null);
  const [comparison, setComparison] = useState<WallArtifact | null>(null);
  const [split, setSplit] = useState(50);
  const [revisionNotes, setRevisionNotes] = useState<Record<string, string>>({});
  const [thumbCount, setThumbCount] = useState(40);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const loadMore = useRef<HTMLDivElement | null>(null);
  const scrollRoot = useRef<HTMLDivElement | null>(null);
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: false });
  const key = `${environmentId}:${threadId}:${scope}`;
  const artifacts = state.key === key ? state.artifacts : [];
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((s) => ({
      key,
      artifacts: s.key === key ? s.artifacts : [],
      error: null,
      loading: true,
    }));
    const load = async () => {
      try {
        const artifacts = await loadWallArtifacts(
          environmentId,
          threadId,
          scope,
          controller.signal,
        );
        if (active) setState({ key, artifacts, error: null, loading: false });
      } catch (error) {
        if (active && !controller.signal.aborted)
          setState((s) => ({
            key,
            artifacts: s.key === key ? s.artifacts : [],
            error: error instanceof Error ? error.message : "暂时无法读取产物",
            loading: false,
          }));
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [environmentId, threadId, scope, key, preparedConnection, retry]);
  useEffect(() => {
    setVisible(40);
    setSelected(null);
    setComparison(null);
    setActionError(null);
  }, [key, filter]);
  const filtered = (() => artifacts.filter((a) => filter === "all" || a.kind === filter))();
  const counts = artifactCounts(artifacts);
  useEffect(() => {
    onCount?.(counts.all);
  }, [counts.all, onCount]);
  const groups = groupArtifacts(filtered.slice(0, visible));
  const images = (() => artifacts.filter((a) => a.kind === "image"))();
  useEffect(() => {
    const element = loadMore.current;
    if (!element || visible >= filtered.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible((n) => n + 40);
      },
      { root: scrollRoot.current, rootMargin: "80px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, filtered.length]);
  const compare = (a: WallArtifact) => {
    setSelected(a);
    setComparison(null);
    setSplit(50);
    setThumbCount(40);
  };
  const revisionKey = selected ? `${key}:${artifactVersionKey(selected)}` : "";
  const revisionNote = revisionNotes[revisionKey] ?? "";
  // Access IDs are renewed on every listing; match the file by its stable version instead.
  const currentSelected = selected
    ? artifacts.find((a) => artifactVersionKey(a) === artifactVersionKey(selected))
    : undefined;
  const selectedIsCurrent = currentSelected !== undefined;
  const requestRevision = () => {
    if (!selected || !selectedIsCurrent || !onRevise || !revisionNote.trim()) return;
    try {
      if (!onRevise(artifactRevisionPrompt(selected, revisionNote))) {
        setActionError("输入框暂不可用，修改意见已保留，请稍后重试。");
        return;
      }
      setRevisionNotes((notes) => ({ ...notes, [revisionKey]: "" }));
      setSelected(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "无法加入草稿，修改意见已保留。");
    }
  };
  const reveal = async (a: WallArtifact) => {
    const result = await openInEditor({
      environmentId,
      input: { cwd: a.path, editor: "file-manager", reveal: true },
    });
    if (result._tag === "Failure") setActionError("无法在 Finder 中显示此文件");
  };
  const attach = async (a: WallArtifact) => {
    setBusy(true);
    setActionError(null);
    try {
      const file = await fileFromArtifact(environmentId, a);
      onAttach([file]);
      setSelected(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "无法附加此文件");
    } finally {
      setBusy(false);
    }
  };
  const openPage = (a: WallArtifact) =>
    window.open(artifactFileUrl(environmentId, a.id) ?? "", "_blank", "noopener,noreferrer");
  const dragArtifact = (event: React.DragEvent, a: WallArtifact) => {
    event.dataTransfer.setData(ARTIFACT_DRAG_TYPE, JSON.stringify({ environmentId, artifact: a }));
    event.dataTransfer.effectAllowed = "copy";
  };
  // Check status and size are detail: they live in the hover text, not in the layout.
  const artifactTooltip = (a: WallArtifact) => (
    <span className="flex max-w-64 flex-col gap-0.5">
      <span className="break-all">{a.name}</span>
      <span className="text-muted-foreground">
        {a.width && a.height ? `${a.width}×${a.height}` : `${Math.ceil(a.sizeBytes / 1024)} KB`}
        {" · "}
        {artifactCheckLabel(a)}
      </span>
      <span className="text-muted-foreground">
        {a.verification?.label
          ? `${a.verification.label} · ${a.verification.checkedAt ?? ""}。此项为检查命令记录，不代表用户验收或已部署。`
          : "文件存在不代表检查通过。完成检查后，由 Agent 关联相应执行记录。"}
      </span>
    </span>
  );
  const thumb = (a: WallArtifact, className: string) =>
    a.kind === "image" ? (
      <img
        src={artifactFileUrl(environmentId, a.id) ?? undefined}
        alt={a.name}
        loading="lazy"
        decoding="async"
        className={className}
      />
    ) : isArtifactVideo(a) ? (
      <video
        src={`${artifactFileUrl(environmentId, a.id) ?? ""}#t=0.1`}
        preload="metadata"
        muted
        playsInline
        aria-label={`视频缩略图 ${a.name}`}
        className={className}
        onLoadedMetadata={(event) => {
          const duration = event.currentTarget.duration;
          if (Number.isFinite(duration))
            setDurations((values) =>
              values[a.id] === duration ? values : { ...values, [a.id]: duration },
            );
        }}
      />
    ) : (
      <div
        className={`${className} flex items-center justify-center bg-muted text-muted-foreground`}
      >
        {a.kind === "page" ? <GlobeIcon className="size-6" /> : <FileIcon className="size-6" />}
      </div>
    );
  if (!active) return null;
  return (
    <section aria-label="产物" className="min-w-0 px-3 pt-2 pb-2" data-artifact-wall>
      <div className="mb-2 flex min-w-0 items-center justify-end gap-1">
        <div className="flex gap-1" aria-label="产物范围">
          {(
            [
              ["thread", "本会话"],
              ["project", "本项目"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              size="xs"
              variant={scope === value ? "secondary" : "ghost"}
              aria-pressed={scope === value}
              onClick={() => {
                setScope(value);
                setFilter("all");
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {!(state.key === key && state.error && artifacts.length === 0) && (
        <div className="mb-2 flex flex-nowrap gap-0.5" aria-label="产物类型">
          {(
            [
              ["all", "全部"],
              ["image", "图片"],
              ["video", "视频"],
              ["page", "页面"],
              ["document", "文档"],
            ] as const
          )
            .filter(([value]) => value === "all" || counts[value] > 0)
            .map(([value, label]) => (
              <Button
                size="micro"
                variant={filter === value ? "secondary" : "ghost"}
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label} {counts[value]}
              </Button>
            ))}
        </div>
      )}
      {actionError ? (
        <p role="alert" className="mb-2 text-2xs text-destructive">
          {actionError}
        </p>
      ) : null}
      <div
        ref={scrollRoot}
        className="max-h-[min(52dvh,28rem)] min-w-0 overflow-y-auto overscroll-contain"
        data-artifact-scroll
      >
        {state.key !== key || state.loading ? (
          <p className="py-2 text-2xs text-muted-foreground">正在读取产物…</p>
        ) : state.error ? (
          <div className="py-2">
            <p role="alert" className="text-2xs text-muted-foreground">
              {state.error}
            </p>
            <Button size="xs" variant="ghost" onClick={() => setRetry((n) => n + 1)}>
              重试
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-2 text-2xs text-muted-foreground">
            {artifacts.length
              ? "没有此类产物"
              : scope === "thread"
                ? "这个会话还没有产物"
                : "这个项目还没有产物"}
          </p>
        ) : null}
        {groups.map((group) => {
          const isMedia = (a: WallArtifact) => a.kind === "image" || isArtifactVideo(a);
          const media = group.artifacts.filter(isMedia);
          const files = group.artifacts.filter((a) => !isMedia(a));
          return (
            <div key={group.label}>
              <p className="my-2 text-2xs text-muted-foreground">{group.label}</p>
              {media.length > 0 ? (
                <div className="grid grid-cols-3 gap-1.5">
                  {media.map((a) => (
                    <div
                      key={a.id}
                      className="group min-w-0"
                      draggable
                      onDragStart={(event) => dragArtifact(event, a)}
                      data-artifact-id={a.id}
                    >
                      <div className="relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <button
                                type="button"
                                aria-label={
                                  isArtifactVideo(a) ? `播放 ${a.name}` : `对比 ${a.name}`
                                }
                                className="block size-full cursor-pointer"
                                onClick={() => compare(a)}
                              />
                            }
                          >
                            {thumb(a, "size-full object-cover")}
                          </TooltipTrigger>
                          <TooltipPopup>{artifactTooltip(a)}</TooltipPopup>
                        </Tooltip>
                        <span className="pointer-events-none absolute top-0.5 left-0.5 rounded-sm bg-background/90 px-1 text-2xs text-foreground">
                          {a.extension.toUpperCase()}
                          {isArtifactVideo(a) && durations[a.id] !== undefined
                            ? ` · ${artifactVideoDuration(durations[a.id]!)}`
                            : null}
                        </span>
                        <div className="absolute right-0 bottom-0 left-0 flex flex-wrap justify-end gap-0.5 bg-background/90 p-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                          {a.kind === "image" ? (
                            <Button size="xs" variant="ghost" onClick={() => compare(a)}>
                              对比
                            </Button>
                          ) : null}
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => void reveal(a)}
                            aria-label={uiText("在 Finder 中显示 {0}", { "0": a.name })}
                          >
                            Finder
                          </Button>
                        </div>
                      </div>
                      <p className="mt-0.5 truncate text-2xs">{a.name}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {files.length > 0 ? (
                <ul className={cn("flex flex-col", media.length > 0 && "mt-1.5")}>
                  {files.map((a) => (
                    <li
                      key={a.id}
                      className="group flex min-w-0 items-center gap-1 rounded-md px-1 hover:bg-accent/50 focus-within:bg-accent/50"
                      draggable
                      onDragStart={(event) => dragArtifact(event, a)}
                      data-artifact-id={a.id}
                    >
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <button
                              type="button"
                              aria-label={`打开 ${a.name}`}
                              className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 py-1 text-left outline-hidden focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                              onClick={() => (a.kind === "page" ? openPage(a) : void reveal(a))}
                            />
                          }
                        >
                          <Badge size="sm" variant="secondary">
                            {a.extension.toUpperCase()}
                          </Badge>
                          <span className="min-w-0 flex-1 truncate text-xs">{a.name}</span>
                          <span className="shrink-0 text-2xs text-muted-foreground group-hover:hidden group-focus-within:hidden">
                            {new Date(a.modifiedAt ?? a.createdAt).toLocaleTimeString("zh-CN", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </TooltipTrigger>
                        <TooltipPopup>{artifactTooltip(a)}</TooltipPopup>
                      </Tooltip>
                      <Button
                        size="xs"
                        variant="ghost"
                        className="hidden shrink-0 group-hover:inline-flex group-focus-within:inline-flex"
                        onClick={() => (a.kind === "page" ? openPage(a) : void reveal(a))}
                        aria-label={
                          a.kind === "page"
                            ? `打开 ${a.name}`
                            : uiText("在 Finder 中显示 {0}", { "0": a.name })
                        }
                      >
                        {a.kind === "page" ? "打开" : "Finder"}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
        {visible < filtered.length ? (
          <div ref={loadMore} className="py-2">
            <Button size="xs" variant="ghost" onClick={() => setVisible((n) => n + 40)}>
              加载更多
            </Button>
          </div>
        ) : null}
      </div>
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogPopup
          variant="media"
          showCloseButton={false}
          className="h-[80dvh] w-full max-w-5xl"
          aria-describedby={undefined}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg bg-background p-4 text-foreground">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle className="min-w-0 flex-1">
                <span className="block truncate">{selected?.name}</span>
              </DialogTitle>
              <Button size="xs" variant="ghost" onClick={() => setSelected(null)}>
                <XIcon className="size-3" />
                Esc 关闭
              </Button>
            </div>
            {selected && !selectedIsCurrent ? (
              <p role="alert" className="text-xs text-muted-foreground">
                文件已更新或移除。请关闭预览，再打开最新版本。
              </p>
            ) : null}
            {selected ? (
              <>
                {isArtifactVideo(selected) ? (
                  <div
                    className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted"
                    data-artifact-player
                  >
                    <video
                      key={selected.id}
                      src={artifactFileUrl(environmentId, currentSelected?.id ?? selected.id) ?? undefined}
                      controls
                      playsInline
                      preload="metadata"
                      className="size-full object-contain"
                      aria-label={`播放 ${selected.name}`}
                    />
                  </div>
                ) : (
                  <div
                    className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted"
                    data-artifact-compare
                  >
                    {comparison ? (
                      <img
                        src={artifactFileUrl(environmentId, comparison.id) ?? undefined}
                        alt={comparison.name}
                        className="absolute inset-0 size-full object-contain"
                      />
                    ) : null}
                    <img
                      src={artifactFileUrl(environmentId, currentSelected?.id ?? selected.id) ?? undefined}
                      alt={selected.name}
                      className="absolute inset-0 size-full object-contain"
                      style={comparison ? { clipPath: `inset(0 0 0 ${split}%)` } : undefined}
                    />
                    {comparison ? (
                      <>
                        <div
                          className="pointer-events-none absolute top-0 bottom-0 border-l-2 border-foreground"
                          style={{ left: `${split}%` }}
                        />
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={split}
                          onChange={(e) => setSplit(Number(e.target.value))}
                          aria-label="拖动中线对比"
                          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
                        />
                        <span
                          className="pointer-events-none absolute top-1/2 rounded-full bg-background px-2 py-1 text-xs text-foreground"
                          style={{ left: `${split}%`, transform: "translate(-50%, -50%)" }}
                        >
                          ↔
                        </span>
                      </>
                    ) : null}
                  </div>
                )}
                {comparison ? (
                  <div className="flex justify-between gap-2 text-2xs text-muted-foreground">
                    <span className="truncate">{comparison.name}</span>
                    <span className="truncate">{selected.name}</span>
                  </div>
                ) : null}
                {!isArtifactVideo(selected) && (
                  <div
                    className="flex shrink-0 gap-2 overflow-x-auto"
                    aria-label="选择对比图片"
                    onScroll={(e) => {
                      if (
                        e.currentTarget.scrollLeft + e.currentTarget.clientWidth >=
                        e.currentTarget.scrollWidth - 40
                      )
                        setThumbCount((n) => n + 40);
                    }}
                  >
                    <Button size="xs" variant="ghost" onClick={() => setComparison(null)}>
                      单图查看
                    </Button>
                    {images.slice(0, thumbCount).map((a) => (
                      <button
                        type="button"
                        key={a.id}
                        className={`size-10 shrink-0 overflow-hidden rounded-md border ${comparison?.id === a.id ? "border-primary" : "border-border"}`}
                        aria-label={`选择对比 ${a.name}`}
                        disabled={artifactVersionKey(a) === artifactVersionKey(selected)}
                        onClick={() => setComparison(a)}
                      >
                        {thumb(a, "size-full object-cover")}
                      </button>
                    ))}
                  </div>
                )}
                {actionError ? (
                  <p role="alert" className="text-xs text-destructive">
                    {actionError}
                  </p>
                ) : null}
                {selected.kind === "image" && onRevise ? (
                  <div className="flex shrink-0 flex-col gap-2">
                    <label htmlFor="artifact-revision-note" className="text-xs">
                      修改意见
                    </label>
                    <textarea
                      id="artifact-revision-note"
                      rows={2}
                      maxLength={8000}
                      className="w-full resize-y rounded-md border border-border bg-background p-2 text-sm"
                      placeholder="例如：修正人物右手边缘，保留构图和其他区域。"
                      value={revisionNote}
                      onChange={(event) => {
                        const note = event.currentTarget.value;
                        setRevisionNotes((notes) => ({ ...notes, [revisionKey]: note }));
                      }}
                    />
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        加入当前会话草稿后发送；完成后选择两张图片对比。
                      </span>
                      <Button
                        size="sm"
                        disabled={!selectedIsCurrent || !revisionNote.trim()}
                        onClick={requestRevision}
                      >
                        加入返工草稿
                      </Button>
                    </div>
                  </div>
                ) : null}
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => void reveal(selected)}>
                    在 Finder 中显示
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => void attach(selected)}>
                    {busy ? "正在附加…" : "附加到输入框"}
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        </DialogPopup>
      </Dialog>
    </section>
  );
}
