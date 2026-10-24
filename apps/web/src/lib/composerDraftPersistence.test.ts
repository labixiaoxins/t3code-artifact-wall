import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createComposerDraftPersistence } from "./composerDraftPersistence";

afterEach(() => vi.useRealTimers());
function setup() {
  const saved = new Map<string, string>();
  let unavailable = false;
  const storage = {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (unavailable) throw new DOMException("Full", "QuotaExceededError");
      saved.set(key, value);
    },
    removeItem: (key: string) => {
      saved.delete(key);
    },
  };
  const controller = createComposerDraftPersistence({
    storage: () => storage,
    serialize: JSON.stringify,
  });
  return {
    saved,
    controller,
    fail: (value: boolean) => {
      unavailable = value;
    },
  };
}
describe("recoverable composer persistence", () => {
  it("flushes the final keystroke before the debounce and restores it", () => {
    vi.useFakeTimers();
    const { controller, saved } = setup();
    controller.setItem("draft", { state: { prompt: "最后一个字" }, version: 9 });
    expect(saved.has("draft")).toBe(false);
    controller.flush();
    expect(JSON.parse(controller.getItem("draft")!).state.prompt).toBe("最后一个字");
    expect(controller.getStatus()).toBe("saved");
    vi.runAllTimers();
    expect(saved.size).toBe(1);
  });
  it("retains failed writes, preserves the last good record and retries the newest input", () => {
    vi.useFakeTimers();
    const { controller, saved, fail } = setup();
    controller.setItem("draft", { state: { prompt: "original" } });
    controller.flush();
    fail(true);
    controller.setItem("draft", { state: { prompt: "unsaved" } });
    vi.advanceTimersByTime(300);
    expect(controller.getStatus()).toBe("unavailable");
    expect(JSON.parse(saved.get("draft")!).state.prompt).toBe("original");
    expect(JSON.parse(controller.recovery().pendingRecord!).state.prompt).toBe("unsaved");
    controller.setItem("draft", { state: { prompt: "newest" } });
    fail(false);
    controller.retry();
    expect(controller.getStatus()).toBe("saved");
    expect(JSON.parse(saved.get("draft")!).state.prompt).toBe("newest");
  });
  it("does not overwrite or delete a corrupt record and exports both records", () => {
    const { controller, saved } = setup();
    saved.set("draft", "{broken");
    expect(controller.getItem("draft")).toBe(null);
    controller.setItem("draft", { state: { prompt: "new input" } });
    controller.flush();
    controller.removeItem("draft");
    expect(saved.get("draft")).toBe("{broken");
    expect(controller.getStatus()).toBe("corrupt");
    expect(controller.recovery().savedRecord).toBe("{broken");
    expect(JSON.parse(controller.recovery().pendingRecord!).state.prompt).toBe("new input");
  });
  it("survives denied access to the storage property", () => {
    const controller = createComposerDraftPersistence({
      storage: () => {
        throw new DOMException("Denied", "SecurityError");
      },
      serialize: JSON.stringify,
    });
    expect(controller.getItem("draft")).toBe(null);
    controller.setItem("draft", { state: { prompt: "keep me" } });
    expect(() => controller.flush()).not.toThrow();
    expect(controller.getStatus()).toBe("unavailable");
    expect(JSON.parse(controller.recovery().pendingRecord!).state.prompt).toBe("keep me");
  });
});
