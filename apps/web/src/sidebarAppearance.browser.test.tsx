import { describe, expect, it } from "vite-plus/test";
import { render } from "../test/render";
import "./index.css";
import { applySidebarAppearance, DEFAULT_SIDEBAR_APPEARANCE } from "./sidebarAppearance";

function setup() {
  const root = document.documentElement;
  const attrs = [
    "style",
    "class",
    "data-sidebar-font-size",
    "data-sidebar-text-light",
    "data-sidebar-text-dark",
  ];
  const saved = attrs.map((name) => [name, root.getAttribute(name)] as const);
  return {
    root,
    [Symbol.dispose]: () => {
      for (const [name, value] of saved) {
        if (value === null) root.removeAttribute(name);
        else root.setAttribute(name, value);
      }
    },
  };
}
function rgb(value: string) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map((c) => c / 255);
}
function luminance(value: string) {
  return rgb(value)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function Probe() {
  return (
    <div>
      <nav data-app-sidebar className="bg-sidebar">
        <span data-testid="title" className="text-sm text-sidebar-foreground">
          标题
        </span>
        <span data-testid="small" className="text-3xs text-sidebar-muted-foreground">小字</span>
      <span data-testid="secondary" className="text-xs text-sidebar-muted-foreground">
          次要文字
        </span>
        <span data-testid="faded" className="text-xs text-sidebar-muted-foreground/55">
          辅助文字
        </span>
      </nav>
      <p data-testid="outside" className="text-sm">
        正文
      </p>
    </div>
  );
}
describe("sidebar appearance", () => {
  it("preserves default CSS and resets only sidebar overrides", async () => {
    using state = setup();
    // The probe has no app state or routing.
    await using screen = await render(<Probe />, { router: false });
    const title = screen.getByTestId("title").element();
    const outside = screen.getByTestId("outside").element();
    const before = { size: getComputedStyle(title).fontSize, color: getComputedStyle(title).color };
    const outsideBefore = getComputedStyle(outside).fontSize;
    applySidebarAppearance(state.root, DEFAULT_SIDEBAR_APPEARANCE);
    expect({
      size: getComputedStyle(title).fontSize,
      color: getComputedStyle(title).color,
    }).toEqual(before);
    applySidebarAppearance(state.root, {
      ...DEFAULT_SIDEBAR_APPEARANCE,
      fontFamilySidebar: "Menlo",
      fontSizeSidebar: 18,
    });
    expect(getComputedStyle(title).fontSize).toBe("15.75px");
    expect(getComputedStyle(screen.getByTestId("small").element()).fontSize).toBe("11.25px");
    expect(getComputedStyle(title).fontFamily).toContain("Menlo");
    expect(getComputedStyle(outside).fontSize).toBe(outsideBefore);
    applySidebarAppearance(state.root, DEFAULT_SIDEBAR_APPEARANCE);
    expect(getComputedStyle(title).fontSize).toBe(before.size);
    expect(state.root.style.getPropertyValue("--font-sidebar")).toBe("");
  });
  it.each([false, true])(
    "meets contrast floors in dark=%s while preserving default ratios",
    async (dark) => {
      using state = setup();
      state.root.classList.toggle("dark", dark);
      state.root.style.setProperty("--appearance-contrast-base", "100%");
      state.root.style.setProperty("--appearance-contrast-boost", "0%");
      // The probe measures the compiled sidebar CSS rather than router behavior.
      await using screen = await render(<Probe />, { router: false });
      const title = screen.getByTestId("title").element(),
        secondary = screen.getByTestId("secondary").element();
      const background = getComputedStyle(title.parentElement!).backgroundColor;
      applySidebarAppearance(state.root, DEFAULT_SIDEBAR_APPEARANCE);
      expect(contrast(getComputedStyle(title).color, background)).toBeCloseTo(
        dark ? 18.9 : 16.97,
        1,
      );
      const defaultSecondary = getComputedStyle(secondary).color;
      expect(contrast(defaultSecondary, background)).toBeGreaterThanOrEqual(4.5);
      applySidebarAppearance(state.root, DEFAULT_SIDEBAR_APPEARANCE);
      expect(getComputedStyle(secondary).color).toBe(defaultSecondary);
      applySidebarAppearance(state.root, {
        ...DEFAULT_SIDEBAR_APPEARANCE,
        sidebarTextColorLight: "high-contrast",
        sidebarTextColorDark: "high-contrast",
      });
      expect(contrast(getComputedStyle(title).color, background)).toBeGreaterThanOrEqual(7);
      expect(contrast(getComputedStyle(secondary).color, background)).toBeGreaterThanOrEqual(4.5);
      expect(
        contrast(getComputedStyle(screen.getByTestId("faded").element()).color, background),
      ).toBeGreaterThanOrEqual(4.5);
    },
  );
});
