// @effect-diagnostics nodeBuiltinImport:off - statfs has no Effect equivalent.
import {
  DiskSpaceSample,
  type DiskSpaceCategory,
  type DiskSpaceInput,
  type DiskSpaceItem,
  type DiskSpaceKind,
  type DiskSpaceReport,
} from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";

import * as ServerConfig from "./config.ts";
import * as ProcessRunner from "./processRunner.ts";

/** Newest backups the retention rule keeps; older ones are flagged for the user to move or delete. */
export const BACKUPS_TO_KEEP = 2;
/** Largest workspaces listed individually; the rest are only counted. */
const LISTED_WORKSPACES = 8;
/** One sample per day, so a month of growth stays under a few kilobytes. */
const HISTORY_MAX_SAMPLES = 30;
const REPORT_MAX_AGE = Duration.minutes(10);
const MEASURE_CONCURRENCY = 4;
const MEASURE_TIMEOUT_PER_TARGET = Duration.minutes(3);
const MEASUREMENT_MAX_DURATION = Duration.minutes(6);
const AWAIT_MEASUREMENT_MAX = Duration.minutes(5);
const HISTORY_FILE_NAME = "disk-space-history.json";

const HistoryJson = Schema.fromJsonString(Schema.Array(DiskSpaceSample));
const decodeHistory = Schema.decodeUnknownOption(HistoryJson);
const encodeHistory = Schema.encodeSync(HistoryJson);

/** `du -sk` prints "<kilobytes>\t<path>" per argument; null when the output has no total. */
export function parseDuKilobytes(stdout: string): number | null {
  const match = /^(\d+)\s/.exec(stdout.trim());
  if (match === null) return null;
  const kilobytes = Number(match[1]);
  return Number.isSafeInteger(kilobytes) ? kilobytes * 1024 : null;
}

/** Items arrive newest first; everything past the newest `keep` is flagged. */
export function flagBackupsOverRetention(
  items: ReadonlyArray<Omit<DiskSpaceItem, "overRetention">>,
  keep: number,
): ReadonlyArray<DiskSpaceItem> {
  return [...items]
    .toSorted((a, b) => Date.parse(b.modifiedAt ?? "") - Date.parse(a.modifiedAt ?? ""))
    .map((item, index) => ({ ...item, overRetention: index >= keep }));
}

/** Replaces today's sample if present, then keeps only the newest `max`. */
export function appendDailySample(
  history: ReadonlyArray<DiskSpaceSample>,
  sample: DiskSpaceSample,
  max: number,
): ReadonlyArray<DiskSpaceSample> {
  const day = sample.at.slice(0, 10);
  return [...history.filter((entry) => entry.at.slice(0, 10) !== day), sample].slice(-max);
}

const sumKnown = (values: ReadonlyArray<number | null>): number | null => {
  const known = values.filter((value): value is number => value !== null);
  return known.length === 0 ? null : known.reduce((total, value) => total + value, 0);
};

export class DiskSpace extends Context.Service<
  DiskSpace,
  {
    /**
     * Returns the cached measurement immediately and refreshes it in the background when stale.
     * With `awaitMeasurement` it waits for the running measurement instead.
     */
    readonly report: (input: DiskSpaceInput) => Effect.Effect<DiskSpaceReport>;
  }
>()("t3/diskSpace") {}

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const scope = yield* Scope.Scope;
  const runner = yield* ProcessRunner.ProcessRunner;

  const historyPath = path.join(config.stateDir, HISTORY_FILE_NAME);
  const codexSessionsDir = path.join(
    process.env.CODEX_HOME && process.env.CODEX_HOME.length > 0
      ? process.env.CODEX_HOME
      : path.join(NodeOS.homedir(), ".codex"),
    "sessions",
  );
  const backupsDir = path.join(config.baseDir, "backups");
  const scratchDir = path.join(config.baseDir, "scratch");

  const latest = yield* Ref.make<DiskSpaceReport | null>(null);
  const inflight = yield* Ref.make<Deferred.Deferred<DiskSpaceReport> | null>(null);

  // Allocated size, like `df` sees it. Hard links are counted once and APFS clones in full, so the
  // numbers are an upper bound, which is the safe side for a "what is filling my disk" view.
  const allocatedBytes = (target: string): Effect.Effect<number | null> =>
    process.platform === "win32"
      ? Effect.succeed(null)
      : runner
          .run({
            command: "du",
            args: ["-sk", "--", target],
            timeout: MEASURE_TIMEOUT_PER_TARGET,
            timeoutBehavior: "timedOutResult",
          })
          // Unreadable subdirectories make du exit non-zero but it still prints the total.
          .pipe(
            Effect.map((output) => (output.timedOut ? null : parseDuKilobytes(output.stdout))),
            Effect.orElseSucceed(() => null),
          );

  const modifiedAtOf = (target: string) =>
    fs.stat(target).pipe(
      Effect.map((stat) =>
        Option.match(stat.mtime, {
          onNone: () => null,
          onSome: (date) => DateTime.formatIso(DateTime.fromDateUnsafe(date)),
        }),
      ),
      Effect.orElseSucceed(() => null),
    );

  const measureChildren = Effect.fn("DiskSpace.measureChildren")(function* (directory: string) {
    const names = yield* fs.readDirectory(directory).pipe(Effect.orElseSucceed(() => []));
    return yield* Effect.forEach(
      names,
      (name) => {
        const child = path.join(directory, name);
        return Effect.all({ bytes: allocatedBytes(child), modifiedAt: modifiedAtOf(child) }).pipe(
          Effect.map(({ bytes, modifiedAt }) => ({ name, path: child, bytes, modifiedAt })),
        );
      },
      { concurrency: MEASURE_CONCURRENCY },
    );
  });

  const category = (
    kind: DiskSpaceKind,
    categoryPath: string,
    bytes: number | null,
    items: ReadonlyArray<DiskSpaceItem> = [],
    unlistedItemCount = 0,
  ): DiskSpaceCategory => ({ kind, path: categoryPath, bytes, items, unlistedItemCount });

  const measureBackups = Effect.gen(function* () {
    const children = yield* measureChildren(backupsDir);
    const items = flagBackupsOverRetention(children, BACKUPS_TO_KEEP);
    return category("backups", backupsDir, sumKnown(items.map((item) => item.bytes)), items);
  });

  const measureWorkspaces = Effect.gen(function* () {
    const children = yield* measureChildren(scratchDir);
    const bySize = children.toSorted((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1));
    const listed = bySize
      .slice(0, LISTED_WORKSPACES)
      .map((item): DiskSpaceItem => ({ ...item, overRetention: false }));
    return category(
      "workspaces",
      scratchDir,
      sumKnown(bySize.map((item) => item.bytes)),
      listed,
      Math.max(0, bySize.length - listed.length),
    );
  });

  const measureDatabase = Effect.gen(function* () {
    const sizes = yield* Effect.forEach(
      [config.dbPath, `${config.dbPath}-wal`, `${config.dbPath}-shm`],
      (file) =>
        fs.stat(file).pipe(
          Effect.map((stat) => Number(stat.size)),
          Effect.orElseSucceed(() => 0),
        ),
    );
    return category(
      "database",
      config.dbPath,
      sizes.reduce((total, size) => total + size, 0),
    );
  });

  const measureTree = (kind: DiskSpaceKind, target: string) =>
    allocatedBytes(target).pipe(Effect.map((bytes) => category(kind, target, bytes)));

  const volumeOf = (target: string) =>
    Effect.tryPromise(() => NodeFSP.statfs(target)).pipe(
      Effect.map((stats) => ({
        freeBytes: Number(stats.bavail) * Number(stats.bsize),
        totalBytes: Number(stats.blocks) * Number(stats.bsize),
      })),
      Effect.orElseSucceed(() => null),
    );

  const readHistory = fs.readFileString(historyPath).pipe(
    Effect.map((text) => Option.getOrElse(decodeHistory(text), () => [])),
    Effect.orElseSucceed((): ReadonlyArray<DiskSpaceSample> => []),
  );

  const placeholder = Effect.gen(function* () {
    const history = yield* readHistory;
    const now = yield* Clock.currentTimeMillis;
    return {
      measuredAt: DateTime.formatIso(DateTime.makeUnsafe(now)),
      measuring: true,
      volume: yield* volumeOf(config.baseDir),
      categories: [
        category("backups", backupsDir, null),
        category("workspaces", scratchDir, null),
        category("agent-history", codexSessionsDir, null),
        category("database", config.dbPath, null),
        category("attachments", config.attachmentsDir, null),
        category("logs", config.logsDir, null),
      ],
      backupsToKeep: BACKUPS_TO_KEEP,
      history,
    } satisfies DiskSpaceReport;
  });

  const measure = Effect.gen(function* () {
    const categories = yield* Effect.all(
      [
        measureBackups,
        measureWorkspaces,
        measureTree("agent-history", codexSessionsDir),
        measureDatabase,
        measureTree("attachments", config.attachmentsDir),
        measureTree("logs", config.logsDir),
      ],
      { concurrency: 2 },
    );
    const now = yield* Clock.currentTimeMillis;
    const at = DateTime.formatIso(DateTime.makeUnsafe(now));
    const volume = yield* volumeOf(config.baseDir);
    const previous = yield* readHistory;
    const history = appendDailySample(
      previous,
      {
        at,
        freeBytes: volume?.freeBytes ?? null,
        bytesByKind: Object.fromEntries(
          categories.flatMap((entry) => (entry.bytes === null ? [] : [[entry.kind, entry.bytes]])),
        ),
      },
      HISTORY_MAX_SAMPLES,
    );
    yield* fs
      .writeFileString(historyPath, encodeHistory(history))
      .pipe(
        Effect.catch((cause) => Effect.logWarning("Could not save disk space history", { cause })),
      );
    return {
      measuredAt: at,
      measuring: false,
      volume,
      categories,
      backupsToKeep: BACKUPS_TO_KEEP,
      history,
    } satisfies DiskSpaceReport;
  }).pipe(
    Effect.timeout(MEASUREMENT_MAX_DURATION),
    Effect.catch((cause) =>
      Effect.logWarning("Disk space measurement failed", { cause }).pipe(
        Effect.andThen(placeholder),
        Effect.map((report): DiskSpaceReport => ({ ...report, measuring: false })),
      ),
    ),
  );

  // One measurement at a time: a refresh while one runs joins it instead of walking the disk twice.
  const startMeasurement = Effect.gen(function* () {
    const done = yield* Deferred.make<DiskSpaceReport>();
    const running = yield* Ref.modify(inflight, (current) =>
      current === null ? [null, done] : [current, current],
    );
    if (running !== null) return running;
    yield* measure.pipe(
      Effect.tap((report) => Ref.set(latest, report)),
      Effect.tap((report) => Deferred.succeed(done, report)),
      Effect.ensuring(Ref.set(inflight, null)),
      Effect.forkIn(scope),
    );
    return done;
  });

  const report = Effect.fn("DiskSpace.report")(function* (input: DiskSpaceInput) {
    const cached = yield* Ref.get(latest);
    const now = yield* Clock.currentTimeMillis;
    const fresh =
      cached !== null &&
      input.refresh !== true &&
      now - Date.parse(cached.measuredAt) <= Duration.toMillis(REPORT_MAX_AGE);
    if (fresh) return cached;
    const pending = yield* startMeasurement;
    if (input.awaitMeasurement === true) {
      const finished = yield* Deferred.await(pending).pipe(
        Effect.timeout(AWAIT_MEASUREMENT_MAX),
        Effect.option,
      );
      if (Option.isSome(finished)) return finished.value;
    }
    return { ...(cached ?? (yield* placeholder)), measuring: true };
  });

  return DiskSpace.of({ report });
});

export const layer = Layer.effect(DiskSpace, make);
