import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { DiskSpaceReport, EnvironmentId } from "@t3tools/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Option from "effect/Option";
import { useEffect, useRef } from "react";
import { uiText } from "~/i18n";
import { formatBytes } from "../../lib/formatBytes";
import { serverEnvironment } from "../../state/server";
import { DISK_SPACE_KINDS, categoryFor, summarizeGrowth } from "./diskSpaceModel";
import { StorageManagementPanel } from "./StorageManagementPanel";

export function DiskSpaceSection({
  environments,
  refreshTick,
}: {
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  readonly refreshTick: number;
}) {
  return (
    <div className="flex flex-col gap-10">
      {environments.map((environment) => (
        <DiskSpaceEnvironment
          key={environment.environmentId}
          environmentId={environment.environmentId}
          label={environments.length > 1 ? environment.label : null}
          refreshTick={refreshTick}
        />
      ))}
    </div>
  );
}
function DiskSpaceEnvironment({
  environmentId,
  label,
  refreshTick,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string | null;
  readonly refreshTick: number;
}) {
  const atom = serverEnvironment.diskSpace({
    environmentId,
    input: { awaitMeasurement: true, ...(refreshTick > 0 ? { refresh: true } : {}) },
  });
  const result = useAtomValue(atom);
  const refresh = useAtomRefresh(atom);
  const handledTick = useRef(refreshTick);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- The page refresh control invalidates the remote measurement cache.
  useEffect(() => {
    if (refreshTick > 1 && refreshTick !== handledTick.current) refresh();
    handledTick.current = refreshTick;
  }, [refreshTick, refresh]);
  const report = Option.getOrNull(AsyncResult.value(result));
  return (
    <section className="flex min-w-0 flex-col gap-6">
      {label ? <h2 className="text-sm font-medium">{label}</h2> : null}
      {report ? (
        <DiskSpaceReportView report={report} />
      ) : (
        <p role="status" className="text-xs text-muted-foreground">
          {uiText(
            result._tag === "Failure"
              ? "This environment could not report disk usage."
              : "Measuring disk usage. You can inspect items below meanwhile.",
          )}
        </p>
      )}
      <StorageManagementPanel
        key={`${environmentId}:${refreshTick}`}
        environmentId={environmentId}
      />
    </section>
  );
}
function DiskSpaceReportView({ report }: { readonly report: DiskSpaceReport }) {
  const growth = summarizeGrowth(report.history);
  const total = report.volume?.totalBytes ?? 0;
  const free = report.volume?.freeBytes ?? 0;
  const largest = Math.max(1, ...report.categories.map((entry) => entry.bytes ?? 0));
  return (
    <div className="space-y-3">
      {report.volume ? (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-medium">{uiText("T3 data volume")}</h3>
            <span className="text-sm tabular-nums">
              {uiText("{free} free of {total}", {
                free: formatBytes(free),
                total: formatBytes(total),
              })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary/60"
              style={{
                width: `${total > 0 ? Math.max(0, Math.min(100, (1 - free / total) * 100)) : 0}%`,
              }}
            />
          </div>
        </>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {uiText("Measurement time")}: {new Date(report.measuredAt).toLocaleString()}
          {report.measuring ? ` · ${uiText("Measuring…")}` : ""}
        </span>
        {growth?.freeBytesChange != null ? (
          <span>
            {uiText("Free-space change")}: {growth.freeBytesChange >= 0 ? "+" : "−"}
            {formatBytes(Math.abs(growth.freeBytesChange))}
          </span>
        ) : null}
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">
          {uiText("Storage breakdown and measurement scope")}
        </summary>
        <div className="mt-3 space-y-3">
          {DISK_SPACE_KINDS.map(({ kind, label, color }) => {
            const category = categoryFor(report, kind);
            return (
              <div
                key={kind}
                className="grid grid-cols-[8rem_minmax(0,1fr)_5rem] items-center gap-3 text-xs"
              >
                <span>{label}</span>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${((category?.bytes ?? 0) / largest) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
                <span className="text-right tabular-nums">
                  {category?.bytes == null ? uiText("Not measured") : formatBytes(category.bytes)}
                </span>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            {uiText(
              "Sizes are allocated space. Cloned files on APFS are counted in full, so totals can exceed what deleting would free.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {uiText(
              "The overview covers T3 data directories and Codex history. Other detected caches and registered archives are listed below; this is not a whole-disk scan.",
            )}
          </p>
        </div>
      </details>
    </div>
  );
}
