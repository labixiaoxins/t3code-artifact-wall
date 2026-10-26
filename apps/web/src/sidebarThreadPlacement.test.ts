import { afterEach, expect, it, vi } from "vite-plus/test";
import {
  parseThreadPlacements,
  THREAD_PLACEMENT_STORAGE_KEY,
  useThreadPlacementStore,
} from "./sidebarThreadPlacement";

afterEach(() => {
  vi.unstubAllGlobals();
  useThreadPlacementStore.setState({ placements: {}, revisions: {} });
});
it("persists moves and restores; a failed save does not falsely move the conversation", () => {
  const values = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => {
    values.set(key, value);
  });
  vi.stubGlobal("localStorage", { setItem });
  expect(useThreadPlacementStore.getState().move("local:thread", "media")).toBe(true);
  expect(parseThreadPlacements(JSON.parse(values.get(THREAD_PLACEMENT_STORAGE_KEY)!))).toEqual({
    "local:thread": "media",
  });
  setItem.mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(useThreadPlacementStore.getState().move("local:thread", "design")).toBe(false);
  expect(useThreadPlacementStore.getState().placements).toEqual({ "local:thread": "media" });
  expect(useThreadPlacementStore.getState().move("local:thread", null)).toBe(true);
  expect(JSON.parse(values.get(THREAD_PLACEMENT_STORAGE_KEY)!)).toEqual({});
});
it("ignores corrupt saved mappings", () => {
  expect(parseThreadPlacements(null)).toEqual({});
  expect(parseThreadPlacements(["wrong"])).toEqual({});
  expect(parseThreadPlacements({ okay: "target", bad: {}, empty: "" })).toEqual({ okay: "target" });
});

it("rejects outdated undo even when a later move returns to the same target", () => {
  vi.stubGlobal("localStorage", { setItem: vi.fn() });
  const state = () => useThreadPlacementStore.getState();
  state().move("thread", "A");
  state().move("thread", "B");
  const first = state().revisions.thread!;
  state().move("thread", "C");
  expect(state().undo("thread", first, "A")).toBe("stale");
  expect(state().placements.thread).toBe("C");
  state().move("thread", "B");
  expect(state().undo("thread", first, "A")).toBe("stale");
  expect(state().placements.thread).toBe("B");
  const last = state().revisions.thread!;
  state().move("unrelated", "other");
  expect(state().undo("thread", last, "C")).toBe("ok");
  expect(state().placements.thread).toBe("C");
  expect(state().undo("thread", last, "C")).toBe("stale");
});
it("a failed undo leaves both placement and revision available for retry", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { setItem });
  const state = () => useThreadPlacementStore.getState();
  state().move("thread", "B");
  const revision = state().revisions.thread!;
  setItem.mockImplementationOnce(() => {
    throw new Error("quota");
  });
  expect(state().undo("thread", revision, null)).toBe("failed");
  expect(state().placements.thread).toBe("B");
  expect(state().revisions.thread).toBe(revision);
  expect(state().undo("thread", revision, null)).toBe("ok");
  expect(state().placements.thread).toBeUndefined();
});
it("invalidates undo after another window updates the store", () => {
  vi.stubGlobal("localStorage", { setItem: vi.fn() });
  const state = () => useThreadPlacementStore.getState();
  state().move("thread", "B");
  const revision = state().revisions.thread!;
  useThreadPlacementStore.setState({ placements: { thread: "B" }, revisions: {} });
  expect(state().undo("thread", revision, null)).toBe("stale");
});
