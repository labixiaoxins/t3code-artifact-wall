import type { KeepAwakeMode } from "@t3tools/contracts";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Schedule from "effect/Schedule";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as Orchestrator from "../orchestration-v2/Orchestrator.ts";
import { forkParked } from "../serverActivation.ts";
import * as ServerSettings from "../serverSettings.ts";

/**
 * Runs that are actively executing. `waiting` (approval or user input) and
 * `queued` are left out on purpose: holding the machine awake for hours while a
 * thread waits on a person would drain the battery for no work.
 */
export const KEEP_AWAKE_ACTIVE_RUN_STATUSES = ["preparing", "starting", "running"] as const;

/** Ignore active-looking rows older than this; a crashed run must not hold the machine forever. */
export const KEEP_AWAKE_MAX_RUN_AGE_MS = 24 * 60 * 60 * 1_000;

const RECHECK_INTERVAL = "30 seconds";
const RESPAWN_DELAY = "5 seconds";

/**
 * `caffeinate` arguments for a mode, or `null` when nothing should be held.
 * `-w` ties the assertion to the server process, so a crashed server cannot
 * leave the machine awake.
 */
export function keepAwakeCommandArgs(
  mode: KeepAwakeMode,
  serverPid: number,
): ReadonlyArray<string> | null {
  const wait = ["-w", String(serverPid)];
  switch (mode) {
    case "off":
      return null;
    case "system":
      return ["-i", ...wait];
    case "display":
      return ["-d", "-i", ...wait];
  }
}

export interface KeepAwakeDependencies<E> {
  readonly platform: NodeJS.Platform;
  readonly pid: number;
  readonly readMode: Effect.Effect<KeepAwakeMode>;
  /** A failure leaves the current assertion unchanged: `reconcile` fails and the caller logs it. */
  readonly countActiveRuns: Effect.Effect<number, E>;
  /** Runs until interrupted; interrupting it must release the wake assertion. */
  readonly hold: (args: ReadonlyArray<string>) => Effect.Effect<void>;
}

/**
 * Decides, from the mode and the number of active runs, whether a wake
 * assertion should be held, and starts or stops it. Calls to `reconcile` must
 * be serialized by the caller.
 */
export const makeKeepAwakeController = <E>(deps: KeepAwakeDependencies<E>) => {
  let holder: { readonly key: string; readonly fiber: Fiber.Fiber<void> } | null = null;

  const release = Effect.gen(function* () {
    const current = holder;
    holder = null;
    if (current !== null) yield* Fiber.interrupt(current.fiber);
  });

  const reconcile = Effect.gen(function* () {
    // Only macOS has `caffeinate`; other platforms keep their default behaviour.
    const args =
      deps.platform === "darwin" ? keepAwakeCommandArgs(yield* deps.readMode, deps.pid) : null;
    const wanted = args !== null && (yield* deps.countActiveRuns) > 0 ? args : null;
    const key = wanted === null ? null : wanted.join(" ");
    if ((holder?.key ?? null) === key) return;
    yield* release;
    if (wanted !== null && key !== null) {
      holder = { key, fiber: yield* Effect.forkDetach(deps.hold(wanted)) };
      // Let the holder start so an immediate release still reaches its cleanup.
      yield* Effect.yieldNow;
    }
  });

  return { reconcile, release, isHolding: () => holder !== null };
};

export const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const settings = yield* ServerSettings.ServerSettingsService;
  const orchestrator = yield* Orchestrator.OrchestratorV2;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const countActiveRuns = Effect.gen(function* () {
    const now = yield* DateTime.now;
    const cutoff = DateTime.makeUnsafe(DateTime.toEpochMillis(now) - KEEP_AWAKE_MAX_RUN_AGE_MS);
    const rows = yield* sql<{ readonly n: number }>`
      SELECT COUNT(*) AS n FROM orchestration_v2_projection_runs
      WHERE status IN ('preparing', 'starting', 'running')
        AND completed_at IS NULL
        AND requested_at > ${DateTime.formatIso(cutoff)}
    `;
    return Number(rows[0]?.n ?? 0);
  });

  const hold = (args: ReadonlyArray<string>) =>
    spawner.spawn(ChildProcess.make("caffeinate", [...args])).pipe(
      Effect.flatMap((child) => child.exitCode),
      Effect.scoped,
      Effect.catch((error) =>
        Effect.logWarning("keep-awake could not run caffeinate", { error: String(error) }),
      ),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("keep-awake caffeinate failed", { cause: Cause.pretty(cause) }),
      ),
      // `caffeinate` exiting on its own is unexpected while we still want it.
      Effect.andThen(Effect.sleep(RESPAWN_DELAY)),
      Effect.forever,
    );

  const controller = makeKeepAwakeController({
    platform: process.platform,
    pid: process.pid,
    readMode: settings.getSettings.pipe(
      Effect.map((value) => value.keepAwake),
      Effect.orElseSucceed((): KeepAwakeMode => "off"),
    ),
    countActiveRuns,
    hold,
  });

  const worker = yield* makeDrainableWorker((_: undefined) =>
    controller.reconcile.pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("keep-awake reconcile failed", { cause: Cause.pretty(cause) }),
      ),
    ),
  );
  yield* Effect.addFinalizer(() => controller.release);

  const start = Effect.gen(function* () {
    const settingsChanges = yield* settings.subscribeChanges;
    yield* forkParked(
      Effect.suspend(() => worker.enqueue(undefined)).pipe(
        Effect.repeat(Schedule.spaced(RECHECK_INTERVAL)),
        Effect.asVoid,
      ),
    );
    yield* forkParked(Stream.runForEach(settingsChanges, () => worker.enqueue(undefined)));
    yield* forkParked(
      Stream.runForEach(orchestrator.streamDomainEvents, (event) =>
        event.type === "run.updated" ? worker.enqueue(undefined) : Effect.void,
      ).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("keep-awake event stream failed", { cause: Cause.pretty(cause) }),
        ),
      ),
    );
  });

  return { start, drain: worker.drain };
});
