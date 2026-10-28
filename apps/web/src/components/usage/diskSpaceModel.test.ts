import type { DiskSpaceCategory, DiskSpaceReport } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  backupCopyCommand,
  daysSince,
  overRetentionBackups,
  overRetentionBytes,
  summarizeGrowth,
} from "./diskSpaceModel";

const sample = (
  at: string,
  freeBytes: number | null,
  bytesByKind: Record<string, number>,
): DiskSpaceReport["history"][number] => ({ at, freeBytes, bytesByKind });

const backups = (
  items: ReadonlyArray<readonly [string, number | null, boolean]>,
): DiskSpaceCategory => ({
  kind: "backups",
  path: "/home/.t3/backups",
  bytes: null,
  unlistedItemCount: 0,
  items: items.map(([name, bytes, overRetention]) => ({
    name,
    path: `/home/.t3/backups/${name}`,
    bytes,
    modifiedAt: null,
    overRetention,
  })),
});

describe("disk space model", () => {
  it("needs two measured days before it reports growth", () => {
    expect(summarizeGrowth([sample("2026-10-24T08:00:00.000Z", 10, {})])).toBeNull();
  });

  it("reports the free-space change and the fastest-growing area, ignoring shrinkage", () => {
    const growth = summarizeGrowth([
      sample("2026-10-24T08:00:00.000Z", 50e9, { backups: 10e9, workspaces: 30e9, logs: 5e9 }),
      sample("2026-10-26T08:00:00.000Z", 38e9, { backups: 22e9, workspaces: 28e9, logs: 6e9 }),
    ]);
    expect(growth).toEqual({
      days: 2,
      freeBytesChange: -12e9,
      fastest: { kind: "backups", bytesChange: 12e9 },
    });
  });

  it("leaves fastest empty when nothing grew and free space unknown", () => {
    const growth = summarizeGrowth([
      sample("2026-10-24T08:00:00.000Z", null, { backups: 10 }),
      sample("2026-10-25T08:00:00.000Z", 5, { backups: 10 }),
    ]);
    expect(growth).toEqual({ days: 1, freeBytesChange: null, fastest: null });
  });

  it("sums only the backups beyond the retention rule", () => {
    const category = backups([
      ["new", 5, false],
      ["old-a", 7, true],
      ["old-b", 11, true],
    ]);
    expect(overRetentionBackups(category).map((item) => item.name)).toEqual(["old-a", "old-b"]);
    expect(overRetentionBytes(category)).toBe(18);
    expect(overRetentionBytes(backups([["new", 5, false]]))).toBe(0);
    expect(overRetentionBytes(backups([["old", null, true]]))).toBeNull();
  });

  it("builds a copy-only command and escapes quotes in paths", () => {
    const command = backupCopyCommand(["/home/a b/it's"]);
    expect(command).toContain("rsync -a '/home/a b/it'\\''s' ");
    expect(command).not.toMatch(/rm |--remove-source-files|mv /);
  });

  it("counts whole days since a timestamp and tolerates bad input", () => {
    const now = Date.parse("2026-10-26T12:00:00.000Z");
    expect(daysSince("2026-10-20T00:00:00.000Z", now)).toBe(6);
    expect(daysSince(null, now)).toBeNull();
    expect(daysSince("not-a-date", now)).toBeNull();
  });
});
