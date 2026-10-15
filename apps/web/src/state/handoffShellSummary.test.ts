import { Atom, AtomRegistry } from "effect/reactivity";
import { ThreadId } from "@t3tools/contracts";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/shell";
import { describe, expect, it } from "vite-plus/test";
import { createHandoffSummaryAtom } from "./handoffShellSummary";

const parent = ThreadId.make("parent");
function shell(id: string, child = false): EnvironmentThreadShell {
  return {
    id: ThreadId.make(id),
    continuedFromThreadId: null,
    deletedAt: null,
    archivedAt: null,
    lineage: {
      relationshipToParent: child ? "subagent" : null,
      parentThreadId: child ? parent : null,
    },
    runtime: { status: "running" },
    title: id,
  } as EnvironmentThreadShell;
}
describe("handoff shell subscription", () => {
  it("publishes no updates for 100 unrelated history changes, but updates child completion and continuation", () => {
    const registry = AtomRegistry.make();
    const threads = Array.from({ length: 649 }, (_, i) => shell(`other-${i}`));
    const child = shell("child", true);
    const source = Atom.make<ReadonlyArray<EnvironmentThreadShell>>([...threads, child]);
    const summary = createHandoffSummaryAtom(source, parent);
    const notifications: unknown[] = [];
    const unsubscribe = registry.subscribe(summary, (value) => notifications.push(value));
    try {
      const initial = registry.get(summary);
      const before = notifications.length;
      for (let i = 0; i < 100; i++) {
        registry.set(source, [
          ...threads.map((t, n) => (n === 0 ? { ...t, title: `stream-${i}` } : t)),
          child,
        ]);
        expect(registry.get(summary)).toBe(initial);
      }
      expect(notifications.length - before).toBe(0);
      registry.set(source, [
        ...threads,
        { ...child, runtime: { ...child.runtime!, status: "completed" } },
      ]);
      expect(registry.get(summary).pendingSubtasks).toBe(0);
      const next = { ...shell("continuation"), continuedFromThreadId: parent };
      registry.set(source, [...threads, next]);
      expect(registry.get(summary).nextThreadId).toBe(next.id);
      expect(notifications.length - before).toBe(2);
    } finally {
      unsubscribe();
      registry.dispose();
    }
  });
});
