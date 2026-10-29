import { expect, it } from "vite-plus/test";
import {
  filterStorageEntries,
  storageReleaseEstimate,
  storageTabFor,
  type StorageEntry,
} from "./storageInventoryModel";
const entry = (path: string, options: Partial<StorageEntry> = {}): StorageEntry => ({
  id: path,
  name: path.split("/").at(-1)!,
  path,
  kind: "scratch",
  reason: "",
  canRelease: false,
  ...options,
});
it("never adds protected, unreviewed or nested bytes to the release estimate", () => {
  const entries = [
    entry("/data/a", { canRelease: true, bytes: 100 }),
    entry("/data/a/dist", { canRelease: true, bytes: 60 }),
    entry("/data/ab", { canRelease: true }),
    entry("/data/huge", { bytes: 999999 }),
  ];
  expect(storageReleaseEstimate(entries)).toEqual({ count: 2, bytes: 100, incomplete: true });
  expect(storageReleaseEstimate([entry("/data/huge", { bytes: 999999 })])).toEqual({
    count: 0,
    bytes: 0,
    incomplete: false,
  });
});
it("keeps volumes and protected data separate, and orders known sizes first", () => {
  const entries = [
    entry("/a/one", { kind: "cache", volumePath: "/a", bytes: 20 }),
    entry("/b/two", { kind: "backups", volumePath: "/b", bytes: 99 }),
    entry("/a/three", { kind: "database", volumePath: "/a" }),
    entry("/a/four", { volumePath: "/a", bytes: 50 }),
  ];
  expect(filterStorageEntries(entries, "candidates", "/a", "").map((v) => v.name)).toEqual([
    "four",
    "one",
  ]);
  expect(filterStorageEntries(entries, "backups", "/a", "")).toEqual([]);
  expect(filterStorageEntries(entries, "protected", "", "THREE").map((v) => v.name)).toEqual([
    "three",
  ]);
  expect(storageTabFor(entries[2]!)).toBe("protected");
});
