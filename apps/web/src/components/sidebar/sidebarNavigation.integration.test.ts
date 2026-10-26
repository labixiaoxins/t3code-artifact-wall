import { describe, expect, it } from "@effect/vitest";
import { useStickyProjectsStore } from "./stickyProjectsStore";
import { StickyProjectsPanel, StickyProjectsTrigger } from "./StickyProjectsPanel";
import { HistorySyncButton } from "./HistorySyncButton";

describe("Sidebar navigation modules and store integration", () => {
  it("exports StickyProjectsPanel, StickyProjectsTrigger, and HistorySyncButton", () => {
    expect(StickyProjectsPanel).toBeDefined();
    expect(StickyProjectsTrigger).toBeDefined();
    expect(HistorySyncButton).toBeDefined();
  });

  it("modifies store state with add, move, and toggle", () => {
    const store = useStickyProjectsStore.getState();
    const testId = { environmentId: "test-env", projectId: "test-proj-1" };
    const testId2 = { environmentId: "test-env", projectId: "test-proj-2" };

    store.addStickyProject(testId);
    expect(useStickyProjectsStore.getState().identities).toContainEqual(testId);

    store.addStickyProject(testId2);
    expect(useStickyProjectsStore.getState().identities).toHaveLength(2);

    store.moveStickyProject(1, "up");
    expect(useStickyProjectsStore.getState().identities[0]).toEqual(testId2);

    // Toggle removes if present
    store.toggleStickyProject(testId2);
    expect(useStickyProjectsStore.getState().identities).not.toContainEqual(testId2);

    // Clean up
    store.removeStickyProject(testId);
    expect(useStickyProjectsStore.getState().identities).toHaveLength(0);
  });
  it("sanitizes same-version persisted identities without replacing store actions", () => {
    const current = useStickyProjectsStore.getState();
    const merge = useStickyProjectsStore.persist.getOptions().merge!;
    const valid = {environmentId: "env", projectId: "project"};
    const restored = merge({identities: [null, {}, valid, valid, {environmentId: 42, projectId: "bad"}]}, current);
    expect(restored.identities).toEqual([valid]);
    expect(restored.addStickyProject).toBe(current.addStickyProject);
    expect(merge({identities: "bad"}, current).identities).toEqual([]);
  });

});
