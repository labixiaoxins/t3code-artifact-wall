import { act } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { manualClipboard } from "../manualClipboard";
vi.mock("./ui/dialog", () => ({
  Dialog: (props: object) => <section {...props} />,
  DialogPopup: (props: object) => <div {...props} />,
  DialogTitle: (props: object) => <h2 {...props} />,
  DialogDescription: (props: object) => <p {...props} />,
}));
import { ManualClipboardDialog } from "./ManualClipboardDialog";
let view: ReactTestRenderer;
afterEach(async () => {
  if (view) await act(async () => view.unmount());
  manualClipboard.clear();
  vi.unstubAllGlobals();
});
describe("manual clipboard fallback", () => {
  it("offers exact failed text for selection, updates on the next failure, and discards it on close", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    await act(async () => {
      view = create(<ManualClipboardDialog />);
    });
    await act(async () => manualClipboard.reveal("虚构 HTTP 复制\n保留换行"));
    expect(view.root.findByType("textarea").props.value).toBe("虚构 HTTP 复制\n保留换行");
    const select = vi.fn();
    view.root.findByType("textarea").props.onFocus({ currentTarget: { select } });
    expect(select).toHaveBeenCalledOnce();
    await act(async () => manualClipboard.reveal("下一次虚构内容"));
    expect(view.root.findByType("textarea").props.value).toBe("下一次虚构内容");
    await act(async () => view.root.findByType("section").props.onOpenChange(false));
    expect(manualClipboard.getSnapshot()).toBeNull();
    expect(view.root.findByType("section").props.open).toBe(false);
  });
});
