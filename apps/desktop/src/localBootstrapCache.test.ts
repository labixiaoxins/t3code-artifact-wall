import { expect, it, vi } from "vite-plus/test";
import { createLocalBootstrapCache } from "./localBootstrapCache.ts";

it("uses synchronous IPC once, then reads pushed snapshots including an empty topology", () => {
  const initial = { id: "synthetic", label: "Synthetic", httpBaseUrl: null, wsBaseUrl: null };
  const readInitial = vi.fn(() => [initial]);
  const cache = createLocalBootstrapCache(readInitial);
  expect(cache.read()).toEqual([initial]);
  for (let index = 0; index < 100; index += 1) cache.read();
  expect(readInitial).toHaveBeenCalledOnce();
  const changed = vi.fn();
  const unsubscribe = cache.subscribe(changed);
  cache.update([{ ...initial, label: "Changed" }]);
  expect(cache.read()[0]?.label).toBe("Changed");
  cache.update([]);
  expect(cache.read()).toEqual([]);
  expect(changed).toHaveBeenCalledTimes(2);
  unsubscribe();
  cache.update([initial]);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(readInitial).toHaveBeenCalledOnce();
});

it("accepts a push before the first renderer read without making a synchronous call", () => {
  const readInitial = vi.fn(() => []);
  const cache = createLocalBootstrapCache(readInitial);
  cache.update([]);
  expect(cache.read()).toEqual([]);
  expect(readInitial).not.toHaveBeenCalled();
});
