import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { usePanelPresence } from "./panelAnimations";

it("retains the last committed open panel without render loops for fresh values", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const renders = vi.fn();
  function Probe({ open, scope, label, animated = true }: {
    open: boolean; scope: string; label: string; animated?: boolean;
  }) {
    const result = usePanelPresence(open, { label }, animated, scope, 200);
    renders(result.present, result.value?.label ?? null);
    return null;
  }
  let root: ReactTestRenderer | undefined;
  try {
    await act(() => { root = create(<Probe open scope="a" label="first" />); });
    expect(renders.mock.calls).toEqual([[true, "first"]]);
    await act(() => { root!.update(<Probe open scope="a" label="updated" />); });
    expect(renders.mock.lastCall).toEqual([true, "updated"]);
    expect(renders).toHaveBeenCalledTimes(2);
    await act(() => { root!.update(<Probe open={false} scope="a" label="uncommitted-close" />); });
    expect(renders.mock.lastCall).toEqual([true, "updated"]);
    await act(() => { vi.advanceTimersByTime(200); });
    expect(renders.mock.lastCall).toEqual([false, null]);
    await act(() => { root!.update(<Probe open scope="b" label="second" />); });
    expect(renders.mock.lastCall).toEqual([true, "second"]);
    await act(() => { root!.update(<Probe open={false} scope="a" label="other-scope" />); });
    expect(renders.mock.lastCall).toEqual([false, null]);
    await act(() => { root!.update(<Probe open scope="a" label="reopened" />); });
    await act(() => { root!.update(<Probe open={false} scope="a" label="closed" animated={false} />); });
    expect(renders.mock.lastCall).toEqual([false, null]);
  } finally {
    if (root) await act(() => root!.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
