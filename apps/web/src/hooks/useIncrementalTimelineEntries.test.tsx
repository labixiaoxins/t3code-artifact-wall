import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";

it("renders fresh equivalent timeline inputs without scheduling a render loop", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const renders = vi.fn();
  function Probe({ revision }: { revision: number }) {
    const entries = useIncrementalTimelineEntries("fixture-thread", {
      visibleTurnItems: [], optimisticMessages: [], anchoredMessages: [],
      attachmentUrlById: new Map(),
    });
    renders(revision, entries);
    return null;
  }
  let root: ReactTestRenderer | undefined;
  try {
    await act(() => { root = create(<Probe revision={0} />); });
    await act(() => { root!.update(<Probe revision={1} />); });
    expect(renders).toHaveBeenCalledTimes(2);
    expect(renders.mock.calls.map(([revision, entries]) => [revision, entries.length]))
      .toEqual([[0, 0], [1, 0]]);
    await act(() => root!.unmount());
  } finally { vi.unstubAllGlobals(); }
});
