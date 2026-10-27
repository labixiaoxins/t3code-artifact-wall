import { StorageManagementPanel } from "./StorageManagementPanel";
import { uiText } from "~/i18n";
import { useAtomRefresh, useAtomValue } from "@effect/atom-react";
import type { DiskSpaceCategory, DiskSpaceReport, EnvironmentId } from "@t3tools/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Option from "effect/Option";
import { useEffect, useRef } from "react";

import { formatBytes } from "../../lib/formatBytes";
import { serverEnvironment } from "../../state/server";
import { DISK_SPACE_KINDS, categoryFor, daysSince, summarizeGrowth } from "./diskSpaceModel";

const sizeLabel = (bytes: number | null) => (bytes === null ? "—" : formatBytes(bytes));

export function DiskSpaceSection({
  environments,
  refreshTick,
}: {
  readonly environments: ReadonlyArray<{
    readonly environmentId: EnvironmentId;
    readonly label: string;
  }>;
  /** Bumped by the page's refresh button; the first bump switches to an uncached measurement. */
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
    input: refreshTick > 0 ? { refresh: true } : {},
  });
  const result = useAtomValue(atom);
  const refreshAtom = useAtomRefresh(atom);
  const handledTick = useRef(refreshTick);
  useEffect(() => {
    // Tick 1 already changed the atom's input; later ticks re-run that same atom.
    if (refreshTick > 1 && refreshTick !== handledTick.current) refreshAtom();
    handledTick.current = refreshTick;
  }, [refreshTick, refreshAtom]);

  const report = Option.getOrNull(AsyncResult.value(result));
  return (
    <section className="flex min-w-0 flex-col gap-6">
      {label === null ? null : <h2 className="text-sm font-medium">{label}</h2>}
      {report === null ? (
        <p className="text-sm text-muted-foreground">
          {result._tag === "Failure"
            ? uiText("This environment could not report disk usage.")
            : uiText("Measuring disk usage. The first pass can take a minute.")}
        </p>
      ) : (
        <>
          <StorageManagementPanel environmentId={environmentId} />
          <p className="text-xs text-muted-foreground">
            {uiText("Measurement time")}: {new Date(report.measuredAt).toLocaleString()}
          </p>
          <DiskSpaceReportView report={report} />
        </>
      )}
    </section>
  );
}

function DiskSpaceReportView({ report }: { readonly report: DiskSpaceReport }) {
  const growth = summarizeGrowth(report.history);
  const largest = Math.max(1, ...report.categories.map((category) => category.bytes ?? 0));
  const backups = categoryFor(report, "backups");
  return (
    <>
      <div className="flex min-w-0 flex-col gap-2">
        {report.volume === null ? null : (
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">{uiText("Free space on this drive")}</h3>
            <span className="text-sm tabular-nums">
              {uiText("{free} free of {total}", {
                free: formatBytes(report.volume.freeBytes),
                total: formatBytes(report.volume.totalBytes),
              })}
            </span>
          </div>
        )}
        {report.volume === null ? null : (
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-foreground/60"
              style={{
                width: `${Math.max(0, Math.min(100, (1 - report.volume.freeBytes / report.volume.totalBytes) * 100))}%`,
              }}
            />
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {report.measuring
            ? uiText("Measuring… sizes below may be from an earlier pass.")
            : uiText(
                "Sizes are allocated space. Cloned files on APFS are counted in full, so totals can exceed what deleting would free.",
              )}
        </p>
        {growth === null ? null : (
          <p className="text-xs text-muted-foreground">
            {growth.freeBytesChange === null
              ? uiText("Since the previous measurement ({days} d ago).", { days: growth.days })
              : uiText("Since the previous measurement ({days} d ago), free space {change}.", {
                  days: growth.days,
                  change: `${growth.freeBytesChange >= 0 ? "+" : "−"}${formatBytes(Math.abs(growth.freeBytesChange))}`,
                })}
            {growth.fastest === null
              ? null
              : ` ${uiText("Grew most: {name} +{size}.", {
                  name:
                    DISK_SPACE_KINDS.find((entry) => entry.kind === growth.fastest?.kind)?.label ??
                    growth.fastest.kind,
                  size: formatBytes(growth.fastest.bytesChange),
                })}`}
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col">
        {DISK_SPACE_KINDS.map(({ kind, label, hint, color }) => {
          const category = categoryFor(report, kind);
          return (
            <div
              key={kind}
              className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-1 border-t py-3 first:border-t-0 sm:grid-cols-[11rem_minmax(0,1fr)_5.5rem]"
            >
              <div className="min-w-0">
                <div className="text-sm">{label}</div>
                <div className="text-xs text-muted-foreground">{hint}</div>
              </div>
              <div className="order-last col-span-2 h-2 overflow-hidden rounded-full bg-muted sm:order-none sm:col-span-1">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${((category?.bytes ?? 0) / largest) * 100}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
              <div className="text-right text-sm tabular-nums">
                {sizeLabel(category?.bytes ?? null)}
              </div>
            </div>
          );
        })}
      </div>

      <BackupRetention category={backups} keep={report.backupsToKeep} />
      <WorkspaceList category={categoryFor(report, "workspaces")} />
    </>
  );
}

function BackupRetention({
  category,
}: {
  readonly category: DiskSpaceCategory | undefined;
  readonly keep: number;
}) {
  if (category === undefined || category.items.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">{uiText("Upgrade backups")}</h3>
        <span className="text-xs text-muted-foreground">
          {uiText("Recovery references must be checked before releasing backups.")}
        </span>
      </div>
      <ul className="flex flex-col">
        {category.items.map((item) => (
          <li
            key={item.path}
            className="flex items-baseline justify-between gap-3 border-t py-2 text-sm first:border-t-0"
          >
            <span className="min-w-0 truncate" title={item.path}>
              {item.name}
              {item.overRetention ? (
                <span className="ms-2 rounded-sm bg-warning/15 px-1.5 py-0.5 text-xs text-warning-foreground">
                  {uiText("Older")}
                </span>
              ) : null}
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {sizeLabel(item.bytes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function WorkspaceList({ category }: { readonly category: DiskSpaceCategory | undefined }) {
  if (category === undefined || category.items.length === 0) return null;
  const now = Date.now();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <h3 className="text-sm font-medium">{uiText("Largest task workspaces")}</h3>
      <ul className="flex flex-col">
        {category.items.map((item) => {
          const idle = daysSince(item.modifiedAt, now);
          return (
            <li
              key={item.path}
              className="flex items-baseline justify-between gap-3 border-t py-2 text-sm first:border-t-0"
            >
              <span className="min-w-0 truncate" title={item.path}>
                {item.name}
                {idle === null || idle < 14 ? null : (
                  <span className="ms-2 text-xs text-muted-foreground">
                    {uiText("untouched for {days} d", { days: idle })}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {sizeLabel(item.bytes)}
              </span>
            </li>
          );
        })}
      </ul>
      {category.unlistedItemCount === 0 ? null : (
        <p className="text-xs text-muted-foreground">
          {uiText("{count} smaller workspaces are counted but not listed.", {
            count: category.unlistedItemCount,
          })}
        </p>
      )}
    </div>
  );
}
