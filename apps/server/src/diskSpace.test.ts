import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, it, vi } from "@effect/vitest";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "./config.ts";
import * as DiskSpace from "./diskSpace.ts";
import * as ProcessRunner from "./processRunner.ts";

const sample = (at: string) => ({ at, freeBytes: 1, bytesByKind: { backups: 2 } });

describe("disk space helpers", () => {
  it("reads du output in kilobytes and rejects anything else", () => {
    assert.equal(DiskSpace.parseDuKilobytes("12\t/tmp/a\n"), 12 * 1024);
    assert.equal(DiskSpace.parseDuKilobytes("0\t/tmp/empty"), 0);
    assert.isNull(DiskSpace.parseDuKilobytes(""));
    assert.isNull(DiskSpace.parseDuKilobytes("du: /tmp/a: No such file"));
  });

  it("flags every backup beyond the newest N, regardless of input order", () => {
    const item = (name: string, modifiedAt: string | null) => ({
      name,
      path: `/b/${name}`,
      bytes: 1,
      modifiedAt,
    });
    const flagged = DiskSpace.flagBackupsOverRetention(
      [
        item("old", "2026-10-01T00:00:00.000Z"),
        item("newest", "2026-10-25T00:00:00.000Z"),
        item("unknown", null),
        item("middle", "2026-10-10T00:00:00.000Z"),
      ],
      2,
    );
    assert.deepEqual(
      flagged.map((entry) => [entry.name, entry.overRetention]),
      [
        ["newest", false],
        ["middle", false],
        ["old", true],
        ["unknown", true],
      ],
    );
  });

  it("keeps one sample per day and drops the oldest past the cap", () => {
    const history = [sample("2026-10-01T08:00:00.000Z"), sample("2026-10-02T08:00:00.000Z")];
    const sameDay = DiskSpace.appendDailySample(history, sample("2026-10-02T20:00:00.000Z"), 30);
    assert.deepEqual(
      sameDay.map((entry) => entry.at),
      ["2026-10-01T08:00:00.000Z", "2026-10-02T20:00:00.000Z"],
    );
    const capped = DiskSpace.appendDailySample(history, sample("2026-10-03T08:00:00.000Z"), 2);
    assert.deepEqual(
      capped.map((entry) => entry.at),
      ["2026-10-02T08:00:00.000Z", "2026-10-03T08:00:00.000Z"],
    );
  });
});

const layer = DiskSpace.layer.pipe(
  Layer.provide(ProcessRunner.layer),
  Layer.provideMerge(ServerConfig.layerTest(process.cwd(), { prefix: "disk-space-" })),
  Layer.provideMerge(NodeServices.layer),
);

describe("DiskSpace service", () => {
  it.effect.skipIf(process.platform === "win32")(
    "measures backups newest-first, flags the surplus, and records one history sample",
    () =>
      Effect.gen(function* () {
        const config = yield* ServerConfig.ServerConfig;
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const emptyCodexHome = yield* fs.makeTempDirectoryScoped({ prefix: "disk-space-codex-" });
        vi.stubEnv("CODEX_HOME", emptyCodexHome);
        yield* Effect.addFinalizer(() => Effect.sync(() => vi.unstubAllEnvs()));

        const backups = path.join(config.baseDir, "backups");
        const day = 24 * 60 * 60 * 1000;
        for (const [index, name] of ["oldest", "middle", "newest"].entries()) {
          const dir = path.join(backups, name);
          yield* fs.makeDirectory(dir, { recursive: true });
          yield* fs.writeFileString(path.join(dir, "data.bin"), "x".repeat(64 * 1024));
          const when = DateTime.toDate(
            DateTime.makeUnsafe(Date.parse("2026-10-20T00:00:00.000Z") + index * day),
          );
          yield* fs.utimes(dir, when, when);
        }
        yield* fs.makeDirectory(path.join(config.baseDir, "scratch", "project-a"), {
          recursive: true,
        });

        yield* fs.writeFileString(path.join(backups, "ARCHIVE-INDEX"), "offline index");
        const service = yield* DiskSpace.DiskSpace;
        const first = yield* service.report({});
        assert.isTrue(first.measuring);
        assert.isTrue(first.categories.every((entry) => entry.bytes === null));

        const measured = yield* service.report({ awaitMeasurement: true });
        assert.isFalse(measured.measuring);
        const backupCategory = measured.categories.find((entry) => entry.kind === "backups");
        assert.deepEqual(
          backupCategory?.items.map((entry) => [entry.name, entry.overRetention]),
          [
            ["newest", false],
            ["middle", false],
            ["oldest", false],
          ],
        );
        assert.isAtLeast(backupCategory?.bytes ?? 0, 3 * 64 * 1024);
        assert.equal(measured.backupsToKeep, DiskSpace.BACKUPS_TO_KEEP);
        assert.equal(measured.history.length, 1);
        assert.isAbove(measured.history[0]?.bytesByKind["backups"] ?? 0, 0);
        assert.isTrue(yield* fs.exists(path.join(config.stateDir, "disk-space-history.json")));

        const again = yield* service.report({});
        assert.equal(again.measuredAt, measured.measuredAt);
        assert.isFalse(again.measuring);
      }).pipe(Effect.scoped, Effect.provide(layer)),
    30_000,
  );
});
