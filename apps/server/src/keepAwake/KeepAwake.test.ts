import type { KeepAwakeMode } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import { describe, expect, it } from "vite-plus/test";

import { keepAwakeCommandArgs, makeKeepAwakeController } from "./KeepAwake.ts";

describe("keepAwakeCommandArgs", () => {
  it("holds nothing when off", () => {
    expect(keepAwakeCommandArgs("off", 42)).toBeNull();
  });

  it("prevents idle system sleep only in system mode", () => {
    expect(keepAwakeCommandArgs("system", 42)).toEqual(["-i", "-w", "42"]);
  });

  it("also keeps the display on in display mode, tied to the server pid", () => {
    expect(keepAwakeCommandArgs("display", 42)).toEqual(["-d", "-i", "-w", "42"]);
  });
});

function harness(input: {
  platform?: NodeJS.Platform;
  mode: KeepAwakeMode;
  active: number;
  failCount?: boolean;
}) {
  const state = {
    mode: input.mode,
    active: input.active,
    failCount: input.failCount ?? false,
    started: [] as string[],
    stopped: [] as string[],
  };
  const controller = makeKeepAwakeController({
    platform: input.platform ?? "darwin",
    pid: 7,
    readMode: Effect.sync(() => state.mode),
    countActiveRuns: Effect.suspend(() =>
      state.failCount ? Effect.fail("db unavailable") : Effect.succeed(state.active),
    ),
    hold: (args) =>
      Effect.sync(() => state.started.push(args.join(" "))).pipe(
        Effect.andThen(Effect.never),
        Effect.onInterrupt(() => Effect.sync(() => state.stopped.push(args.join(" ")))),
      ),
  });
  const run = <E>(effect: Effect.Effect<unknown, E>) => Effect.runPromise(effect);
  return { state, controller, run };
}

describe("makeKeepAwakeController", () => {
  it("starts holding when a run becomes active and releases when none are left", async () => {
    const { state, controller, run } = harness({ mode: "display", active: 0 });
    await run(controller.reconcile);
    expect(controller.isHolding()).toBe(false);

    state.active = 2;
    await run(controller.reconcile);
    await run(controller.reconcile);
    expect(state.started).toEqual(["-d -i -w 7"]);
    expect(controller.isHolding()).toBe(true);

    state.active = 0;
    await run(controller.reconcile);
    await Effect.runPromise(Effect.yieldNow);
    expect(state.stopped).toEqual(["-d -i -w 7"]);
    expect(controller.isHolding()).toBe(false);
  });

  it("swaps the assertion when the mode changes while a run is active", async () => {
    const { state, controller, run } = harness({ mode: "display", active: 1 });
    await run(controller.reconcile);
    state.mode = "system";
    await run(controller.reconcile);
    expect(state.started).toEqual(["-d -i -w 7", "-i -w 7"]);
    expect(state.stopped).toEqual(["-d -i -w 7"]);
    state.mode = "off";
    await run(controller.reconcile);
    expect(state.stopped).toEqual(["-d -i -w 7", "-i -w 7"]);
    expect(controller.isHolding()).toBe(false);
  });

  it("never holds on other platforms", async () => {
    const { state, controller, run } = harness({ platform: "linux", mode: "display", active: 3 });
    await run(controller.reconcile);
    expect(state.started).toEqual([]);
    expect(controller.isHolding()).toBe(false);
  });

  it("keeps the current assertion when the active-run read fails", async () => {
    const { state, controller, run } = harness({ mode: "display", active: 1 });
    await run(controller.reconcile);
    state.failCount = true;
    await expect(run(controller.reconcile)).rejects.toBeDefined();
    expect(controller.isHolding()).toBe(true);
    expect(state.stopped).toEqual([]);
  });

  it("release interrupts a held assertion", async () => {
    const { state, controller, run } = harness({ mode: "system", active: 1 });
    await run(controller.reconcile);
    await run(controller.release);
    expect(state.stopped).toEqual(["-i -w 7"]);
    expect(controller.isHolding()).toBe(false);
  });
});

describe("hold lifecycle", () => {
  it("a forked hold effect stops when interrupted", async () => {
    let stopped = false;
    await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkDetach(
          Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => (stopped = true)))),
        );
        yield* Effect.yieldNow;
        yield* Fiber.interrupt(fiber);
      }),
    );
    expect(stopped).toBe(true);
  });
});
