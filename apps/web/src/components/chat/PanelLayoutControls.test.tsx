import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vite-plus/test";
const state = vi.hoisted(() => ({ mobile: true }));
vi.mock("../../hooks/useMediaQuery", () => ({ useIsMobile: () => state.mobile }));
vi.mock("../ui/toggle", () => ({ Toggle: (props: object) => <button {...props} /> }));
vi.mock("../ui/tooltip", () => ({
  Tooltip: (props: { children: React.ReactNode }) => <>{props.children}</>,
  TooltipTrigger: (props: { render: React.ReactNode }) => <>{props.render}</>,
  TooltipPopup: (props: object) => <span {...props} />,
}));
vi.mock("../ui/popover", () => ({
  PopoverCreateHandle: vi.fn(),
  PopoverTrigger: (props: { render: React.ReactNode }) => (
    <section data-desktop-popover>{props.render}</section>
  ),
}));
import { PanelLayoutControls } from "./PanelLayoutControls";
it("uses an explicit mobile sheet toggle and preserves the desktop popover trigger", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const toggle = vi.fn();
  const props = {
    terminalAvailable: false,
    terminalOpen: false,
    terminalShortcutLabel: null,
    threadPanelOpen: false,
    threadPanelPresentation: "popover" as const,
    threadPanelShortcutLabel: null,
    threadPanelHasAttention: false,
    rightPanelAvailable: false,
    rightPanelOpen: false,
    rightPanelShortcutLabel: null,
    onToggleTerminal: vi.fn(),
    onToggleThreadPanel: toggle,
    onToggleRightPanel: vi.fn(),
  };
  let view!: ReactTestRenderer;
  await act(async () => {
    view = create(<PanelLayoutControls {...props} />);
  });
  expect(view.root.findAllByType("section")).toHaveLength(0);
  const button = view.root
    .findAllByType("button")
    .find((b) => b.props["aria-label"] === "Toggle thread details panel")!;
  await act(async () => button.props.onPressedChange(true));
  expect(toggle).toHaveBeenCalledOnce();
  state.mobile = false;
  await act(async () => view.update(<PanelLayoutControls {...props} threadPanelOpen />));
  expect(view.root.findAllByType("section")).toHaveLength(1);
  expect(
    view.root
      .findAllByType("button")
      .find((b) => b.props["aria-label"] === "Toggle thread details panel")!.props.onPressedChange,
  ).toBeUndefined();
  await act(async () => view.unmount());
  vi.unstubAllGlobals();
});
