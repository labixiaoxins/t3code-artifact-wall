import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState, useEffect, useRef } from "react";
import { useAtomValue, useAtomRefresh } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Option from "effect/Option";
import type { EnvironmentId, StorageActionInput, StorageOperation } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { uiText } from "~/i18n";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatBytes } from "../../lib/formatBytes";
import { Button } from "../ui/button";
import {
  filterStorageEntries,
  storageReleaseEstimate,
  type StorageTab,
} from "./storageInventoryModel";

const phaseLabel: Record<string, string> = {
  planned: "Awaiting confirmation",
  queued: "Queued",
  started: "Started",
  archiving: "Archiving",
  verifying: "Verifying",
  verified_source_kept: "Archived; original kept",
  retirement_intent: "Preparing release",
  releasing: "Releasing",
  "cleaning-logs": "Releasing",
  restoring: "Restoring",
  completed: "Completed",
  cancelled: "Cancelled",
  failed: "Failed",
  locked: "Needs inspection",
  source_restored: "Original path restored",
};
const activePhases = new Set([
  "queued",
  "started",
  "archiving",
  "verifying",
  "retirement_intent",
  "releasing",
  "restoring",
  "cleaning-logs",
]);
const tabs: ReadonlyArray<{ id: StorageTab; label: string }> = [
  { id: "candidates", label: "Review items" },
  { id: "backups", label: "Backups" },
  { id: "protected", label: "Protected data" },
  { id: "history", label: "Archives and activity" },
];
const kindLabels: Record<string, string> = {
  scratch: "Workspace total",
  workspace: "Project directory",
  dependencies: "Dependencies",
  builds: "Build outputs",
  cache: "AI tool cache",
  logs: "Logs",
  backups: "Backup",
  protected: "Conversation history",
  database: "Chat database",
  attachments: "Attachments",
};

export function StorageManagementPanel({ environmentId }: { environmentId: EnvironmentId }) {
  const [objectId, setObjectId] = useState<string | undefined>();
  const [tab, setTab] = useState<StorageTab>("candidates");
  const [volumePath, setVolumePath] = useState("");
  const [volumeId, setVolumeId] = useState("");
  const [plan, setPlan] = useState<StorageOperation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [measureSizes, setMeasureSizes] = useState(false);
  const atom = serverEnvironment.inspectStorage({
    environmentId,
    input: { ...(objectId ? { objectId } : {}), measureSizes },
  });
  const result = useAtomValue(atom);
  const data = Option.getOrNull(AsyncResult.value(result));
  const refresh = useAtomRefresh(atom);
  const allowed = useAtomValue(serverEnvironment.manageStorage.permissionAtom(environmentId));
  const run = useAtomCommand(serverEnvironment.manageStorage, { reportFailure: false });
  const statusAtom = serverEnvironment.inspectStorage({
    environmentId,
    input: { statusOnly: true },
  });
  const statusResult = useAtomValue(statusAtom);
  const statusData = Option.getOrNull(AsyncResult.value(statusResult));
  const refreshStatus = useAtomRefresh(statusAtom);
  const operations = statusData?.operations ?? data?.operations ?? [];
  const submitted =
    submittedId !== null &&
    !operations.some((op) => op.id === submittedId && op.phase !== "planned");
  const running = submitted || operations.some((op) => activePhases.has(op.phase));
  const finishedKey = operations
    .filter((op) => !activePhases.has(op.phase) && op.phase !== "planned")
    .map((op) => op.id + op.phase)
    .join("|");
  const previousFinished = useRef<string | undefined>(undefined);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Refresh filesystem inventory after a remote operation completes.
  useEffect(() => {
    if (previousFinished.current !== undefined && previousFinished.current !== finishedKey)
      refresh();
    previousFinished.current = finishedKey;
  }, [finishedKey, refresh, previousFinished]);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Poll only while a remote filesystem operation is active.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(refreshStatus, 3000);
    return () => window.clearInterval(timer);
  }, [running, refreshStatus]);
  const act = async (input: StorageActionInput) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await run({ environmentId, input });
      if (result._tag === "Success") {
        if (
          input.action === "plan" ||
          input.action === "restore-plan" ||
          input.action === "logs-plan"
        )
          setPlan(result.value);
        if (input.action === "execute") {
          setSubmittedId(result.value.id);
          setPlan(result.value);
        }
        if (input.action === "cancel") {
          setPlan(null);
          setSubmittedId(null);
        }
        refreshStatus();
      } else setError(String(squashAtomCommandFailure(result)));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPending(false);
    }
  };
  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
    } catch {
      setError(uiText("Could not copy the path. Select it in the details instead."));
    }
  };
  if (!data)
    return (
      <div className="space-y-2">
        <p role="status" className="text-sm text-muted-foreground">
          {uiText(
            result._tag === "Failure"
              ? "Storage inspection unavailable. No files were changed."
              : "Inspecting storage…",
          )}
        </p>
        <Button variant="outline" size="sm" onClick={refresh}>
          {uiText("Retry")}
        </Button>
      </div>
    );
  const entries = filterStorageEntries(data.entries, tab, volumePath, filter);
  const estimate = storageReleaseEstimate(
    data.entries.filter((entry) => !volumePath || entry.volumePath === volumePath),
  );
  const selectedVolume = data.volumes.find((volume) => volume.path === volumePath);
  const targets = data.volumes.filter((volume) => volume.internal !== true);
  const busy = pending || running;
  return (
    <section className="flex min-w-0 flex-col gap-4" aria-busy={pending || result.waiting}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="text-sm">
          <span className="sr-only">{uiText("Storage volume")}</span>
          <select
            aria-label={uiText("Storage volume")}
            value={volumePath}
            onChange={(event) => setVolumePath(event.target.value)}
            className="max-w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">{uiText("All inspected volumes")}</option>
            {data.volumes.map((volume) => (
              <option key={volume.id} value={volume.path}>
                {volume.internal ? uiText("T3 data volume") : volume.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={result.waiting || busy}
            onClick={() => {
              if (!measureSizes) setMeasureSizes(true);
              else refresh();
            }}
          >
            {uiText(measureSizes ? "Refresh sizes" : "Measure sizes")}
          </Button>
          <Link to="/settings/maintenance" className="self-center text-xs underline">
            {uiText("Cleanup rules and run")}
          </Link>
        </div>
      </div>
      {selectedVolume ? (
        <div className="space-y-2">
          <p className="text-sm tabular-nums">
            {uiText("Free space")}: {formatBytes(selectedVolume.freeBytes)}
            {selectedVolume.totalBytes ? ` / ${formatBytes(selectedVolume.totalBytes)}` : ""}
          </p>
          {selectedVolume.totalBytes ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary/60"
                style={{
                  width: `${Math.max(0, Math.min(100, (1 - selectedVolume.freeBytes / selectedVolume.totalBytes) * 100))}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {uiText("Reviewed release candidates")}:{" "}
          <strong className="font-medium text-foreground">
            {estimate.count === 0
              ? uiText("None verified")
              : `${estimate.incomplete ? "≥ " : ""}${formatBytes(estimate.bytes)} · ${estimate.count}`}
          </strong>
        </span>
        <span>
          {uiText("Checked")}: {new Date(data.checkedAt).toLocaleTimeString()}
        </span>
      </div>
      <div
        className="flex flex-wrap gap-x-5 border-b"
        role="tablist"
        aria-label={uiText("Storage categories")}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`border-b-2 px-0 py-2 text-sm ${tab === item.id ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {uiText(item.label)}
          </button>
        ))}
      </div>
      {tab !== "history" ? (
        <div role="tabpanel" className="space-y-3">
          <div className="flex items-center gap-2">
            <input
              aria-label={uiText("Filter storage items")}
              placeholder={uiText("Filter by name or path")}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
            />
            {objectId ? (
              <Button variant="outline" size="sm" onClick={() => setObjectId(undefined)}>
                {uiText("All directories")}
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {uiText(
              tab === "protected"
                ? "Chats, attachments, account settings and source files stay protected."
                : tab === "backups"
                  ? "Age alone never makes a backup safe to remove. Active rollback references stay protected."
                  : "Workspace totals include their build and dependency rows. Sizes are not added together or treated as reclaimable space.",
            )}
          </p>
          <div className="max-h-[32rem] overflow-y-auto">
            {entries.map((item) => (
              <div key={item.id} className="border-b py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.name}</div>
                    <span className="text-xs text-muted-foreground">
                      {uiText(kindLabels[item.kind] ?? "Directory")}
                      {item.modifiedAt
                        ? ` · ${new Date(item.modifiedAt).toLocaleDateString()}`
                        : ""}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm tabular-nums">
                    {item.bytes == null ? uiText("Not measured") : formatBytes(item.bytes)}
                  </span>
                </div>
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">
                    {uiText("Details and actions")}
                  </summary>
                  <p className="my-2 break-all select-text">{item.path}</p>
                  <p className="mb-2 text-muted-foreground">{item.reason}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="ghost" size="xs" onClick={() => void copyPath(item.path)}>
                      {uiText("Copy path")}
                    </Button>
                    {item.canExpand !== false && item.canArchive !== false ? (
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => {
                          setObjectId(item.id);
                          setFilter("");
                          setTab("candidates");
                        }}
                      >
                        {uiText("Inspect directory")}
                      </Button>
                    ) : null}
                    {item.canArchive !== false && tab !== "protected" ? (
                      <>
                        <Button
                          variant="outline"
                          size="xs"
                          disabled={!allowed || busy || !volumeId}
                          onClick={() =>
                            void act({
                              action: "plan",
                              objectId: item.id,
                              volumeId,
                              mode: "archive-only",
                            })
                          }
                        >
                          {uiText("Preview archive")}
                        </Button>
                        {item.canRelease ? (
                          <Button
                            variant="outline"
                            size="xs"
                            disabled={!allowed || busy || !volumeId}
                            onClick={() =>
                              void act({
                                action: "plan",
                                objectId: item.id,
                                volumeId,
                                mode: "archive-and-release",
                              })
                            }
                          >
                            {uiText("Preview archive and release")}
                          </Button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </details>
              </div>
            ))}
          </div>
          {entries.length === 0 ? (
            <p className="py-5 text-center text-sm text-muted-foreground">
              {uiText("No matching items in this scan.")}
            </p>
          ) : null}
          {data.truncated ? (
            <p className="text-xs text-muted-foreground">
              {uiText("Scan limit reached. Inspect an individual directory for more detail.")}
            </p>
          ) : null}
        </div>
      ) : (
        <div role="tabpanel" className="space-y-4">
          <h4 className="text-sm font-medium">{uiText("Restorable archives")}</h4>
          {data.archives
            .filter((archive) => !volumePath || archive.path.startsWith(volumePath + "/"))
            .map((archive) => (
              <div key={archive.id} className="space-y-2 border-b py-3">
                <p className="text-sm">
                  {archive.name} · {uiText(archive.online ? "Online" : "Offline")}
                </p>
                <p className="break-all text-xs text-muted-foreground">{archive.path}</p>
                <Button
                  variant="outline"
                  size="xs"
                  disabled={!allowed || busy || !archive.online || !archive.restorable}
                  onClick={() =>
                    void act({
                      action: "restore-plan",
                      objectId: archive.id,
                      ...(volumeId ? { volumeId } : {}),
                    })
                  }
                >
                  {uiText("Preview restore to new folder")}
                </Button>
              </div>
            ))}
          {data.archives.length === 0 ? (
            <p className="text-xs text-muted-foreground">{uiText("No registered archives yet.")}</p>
          ) : null}
          <h4 className="text-sm font-medium">{uiText("Activity")}</h4>
          {operations.map((op) => (
            <div key={op.id} className="space-y-2 border-b py-3 text-xs">
              <p>
                {uiText(phaseLabel[op.phase] ?? op.phase)} ·{" "}
                {new Date(op.createdAt).toLocaleString()}
              </p>
              <p className="break-all">{op.source ?? op.destination ?? op.archive}</p>
              {op.held ? <p className="break-all">{op.held}</p> : null}
              {op.error ? <p role="alert">{op.error}</p> : null}
              {op.freeAfter !== undefined && op.freeBefore !== undefined ? (
                <p>
                  {uiText("Observed free-space change")}:{" "}
                  {op.freeAfter >= op.freeBefore ? "+" : "−"}
                  {formatBytes(Math.abs(op.freeAfter - op.freeBefore))} ·{" "}
                  {uiText("Includes other disk activity")}
                </p>
              ) : null}
              {op.phase === "locked" && op.type !== "log-cleanup" ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!allowed || pending}
                  onClick={() => void act({ action: "reconcile", planId: op.id })}
                >
                  {uiText("Inspect interrupted operation")}
                </Button>
              ) : null}
              {activePhases.has(op.phase) ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!allowed || pending}
                  onClick={() => void act({ action: "cancel", planId: op.id })}
                >
                  {uiText("Stop after current step")}
                </Button>
              ) : null}
            </div>
          ))}
          {operations.length === 0 ? (
            <p className="text-xs text-muted-foreground">{uiText("No storage operations yet.")}</p>
          ) : null}
        </div>
      )}
      {!selectedVolume || selectedVolume.internal === true ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={!allowed || busy}
            onClick={() => void act({ action: "logs-plan" })}
          >
            {uiText("Preview cleanup of rotated logs older than 30 days")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {uiText("A verified compressed copy is kept for recovery.")}
          </span>
        </div>
      ) : null}
      <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {uiText("Archive / restore destination")}
        <select
          value={volumeId}
          onChange={(event) => setVolumeId(event.target.value)}
          className="max-w-full rounded-md border bg-background px-2 py-1.5 text-foreground"
        >
          <option value="">{uiText("Choose an external APFS / HFS+ volume")}</option>
          {targets.map((volume) => (
            <option key={volume.id} value={volume.id}>
              {volume.name} · {formatBytes(volume.freeBytes)}
            </option>
          ))}
        </select>
      </label>
      {!allowed ? (
        <p className="text-xs text-muted-foreground">
          {uiText("This connection has view-only storage access.")}
        </p>
      ) : null}
      {plan?.phase === "planned" ? (
        <div
          className="space-y-3 rounded-lg border bg-muted/30 p-4"
          role="region"
          aria-label={uiText("Confirm storage plan")}
        >
          <h4 className="text-sm font-medium">{uiText("Confirm storage plan")}</h4>
          <p className="break-all text-xs">{plan.source ?? plan.destination}</p>
          {plan.archive ? <p className="break-all text-xs">{plan.archive}</p> : null}
          <p className="text-sm">
            {formatBytes(plan.sourceBytes)} ·{" "}
            {uiText(
              plan.type === "restore"
                ? "Restore to a new directory; never overwrite."
                : plan.release
                  ? "Release the source only after archive verification."
                  : "Archive a copy; keep the original.",
            )}
          </p>
          {plan.items ? (
            <details className="text-xs">
              <summary className="cursor-pointer">
                {uiText("Files in this plan")} · {plan.items.length}
              </summary>
              <ul className="mt-2 max-h-48 overflow-auto">
                {plan.items.map((item) => (
                  <li key={item.path} className="break-all py-1">
                    {item.path} · {formatBytes(item.bytes)}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {plan.warnings?.map((warning) => (
            <p key={warning} className="text-xs text-muted-foreground">
              {warning}
            </p>
          ))}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!allowed || busy}
              onClick={() => void act({ action: "execute", planId: plan.id })}
            >
              {uiText(
                plan.type === "restore"
                  ? "Confirm restore"
                  : plan.release
                    ? "Confirm archive and release"
                    : "Confirm archive copy",
              )}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void act({ action: "cancel", planId: plan.id })}
            >
              {uiText("Cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      {running ? (
        <p role="status" className="text-xs">
          {uiText("Storage operation in progress. See Archives and activity.")}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="break-all text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
