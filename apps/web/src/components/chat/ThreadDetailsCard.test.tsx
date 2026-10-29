import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
import type { ScopedThreadRef } from "@t3tools/contracts";
const state = vi.hoisted(() => ({
  mobile: false,
  report: vi.fn(),
  mode: vi.fn(),
  setOpen: vi.fn(),
}));
vi.mock("../../hooks/useMediaQuery", () => ({ useIsMobile: () => state.mobile }));
vi.mock("./ChatCanvasContext", () => ({
  useChatCanvas: () => ({
    container: { height: 800 },
    detailsCardPlacement: { x: 988, y: 64, width: 280, height: 700 },
    preferredDetailsCard: { x: 988, y: 64, width: 280, height: 700 },
    lane: {},
    layout: {},
    reportDetailsCard: state.report,
  }),
}));
vi.mock("./threadDetailsCardLayout", () => ({
  THREAD_DETAILS_CARD_GAP: 16,
  resolveThreadDetailsCardLayout: () => ({ x: 988, y: 64, width: 280, height: 700 }),
  resolveThreadDetailsCardDensity: () => "full",
}));
vi.mock("../../rightPanelStore", () => ({
  selectThreadPanelOpen: (_: unknown, __: unknown, mode: string) => mode === "inline",
  useRightPanelStore: Object.assign(
    (selector: (state: object) => unknown) => selector({ threadPanelVisibilityByThreadKey: {} }),
    { getState: () => ({ setThreadPanelOpen: state.setOpen }) },
  ),
}));
vi.mock("../ui/sheet", () => ({
  Sheet: (props: object) => <section {...props} />,
  SheetPopup: (props: object) => <div {...props} />,
  SheetTitle: (props: object) => <h2 {...props} />,
}));
vi.mock("../ui/scroll-area", () => ({ ScrollArea: (props: object) => <div {...props} /> }));
vi.mock("../ui/popover", () => ({
  Popover: (props: object) => <section {...props} />,
  PopoverPopup: (props: object) => <div {...props} />,
  PopoverCreateHandle: vi.fn(),
}));
import { ThreadDetailsCard } from "./ThreadDetailsCard";
it("switches desktop inline details to phone popover even while canvas geometry is stale", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const props = {
    threadRef: { environmentId: "fake", threadId: "fake" } as ScopedThreadRef,
    anchor: { current: null },
    handle: {} as never,
    onPresentationChange: state.mode,
    children: () => <p>fictional details</p>,
  };
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<ThreadDetailsCard contentKey="test" {...props} />);
  });
  expect(view.root.findAllByType("aside")).toHaveLength(1);
  state.mobile = true;
  await act(async () => view.update(<ThreadDetailsCard contentKey="test" {...props} />));
  expect(view.root.findAllByType("aside")).toHaveLength(0);
  expect(view.root.findAllByProps({ "data-thread-details-panel": "mobile" })).toHaveLength(1);
  expect(view.root.findByType("section").props.open).toBe(false);
  await act(async () => view.unmount());
  vi.unstubAllGlobals();
});
