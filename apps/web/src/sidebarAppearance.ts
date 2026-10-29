import type { ClientSettings } from "@t3tools/contracts/settings";
import { appearanceFontStack } from "./appearanceFonts";

export type SidebarAppearanceSettings = Pick<
  ClientSettings,
  "fontFamilySidebar" | "fontSizeSidebar" | "sidebarTextColorLight" | "sidebarTextColorDark"
>;

export const DEFAULT_SIDEBAR_APPEARANCE: SidebarAppearanceSettings = {
  fontFamilySidebar: "",
  fontSizeSidebar: 0,
  sidebarTextColorLight: "default",
  sidebarTextColorDark: "default",
};

export function applySidebarAppearance(
  root: HTMLElement,
  settings: SidebarAppearanceSettings,
): void {
  if (settings.fontFamilySidebar.trim() === "") root.style.removeProperty("--font-sidebar");
  else
    root.style.setProperty(
      "--font-sidebar",
      appearanceFontStack(settings.fontFamilySidebar, "var(--font-sans)"),
    );
  root.toggleAttribute("data-sidebar-font-size", settings.fontSizeSidebar !== 0);
  if (settings.fontSizeSidebar === 0) root.style.removeProperty("--font-size-sidebar");
  else root.style.setProperty("--font-size-sidebar", `${settings.fontSizeSidebar}px`);
  root.dataset.sidebarTextLight = settings.sidebarTextColorLight;
  root.dataset.sidebarTextDark = settings.sidebarTextColorDark;
}
