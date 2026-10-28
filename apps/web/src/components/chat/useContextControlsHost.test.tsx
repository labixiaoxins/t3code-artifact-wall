import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { useContextControlsHost } from "./useContextControlsHost";

it("publishes the visible host across collapse, expansion and unmount", async () => {
  const document = { nodeType: 9, addEventListener() {}, removeEventListener() {} };
  const container = {
    nodeType: 1, tagName: "DIV", namespaceURI: "http://www.w3.org/1999/xhtml",
    ownerDocument: document, addEventListener() {}, removeEventListener() {},
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { document, HTMLIFrameElement: EventTarget });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const root = createRoot(container as unknown as HTMLElement);
  const collapsedHost = {} as HTMLDivElement;
  const expandedHost = {} as HTMLDivElement;
  const onChange = vi.fn();
  function Probe({ collapsed }: { collapsed: boolean }) {
    const refs = useContextControlsHost(collapsed, onChange);
    refs.collapsedHostRef.current = collapsedHost;
    refs.expandedHostRef.current = expandedHost;
    return null;
  }
  try {
    await act(() => root.render(<Probe collapsed={false} />));
    expect(onChange).toHaveBeenLastCalledWith(expandedHost);
    await act(() => root.render(<Probe collapsed />));
    expect(onChange).toHaveBeenLastCalledWith(collapsedHost);
    await act(() => root.render(<Probe collapsed={false} />));
    expect(onChange).toHaveBeenLastCalledWith(expandedHost);
    await act(() => root.unmount());
    expect(onChange).toHaveBeenLastCalledWith(null);
  } finally {
    vi.unstubAllGlobals();
  }
});
