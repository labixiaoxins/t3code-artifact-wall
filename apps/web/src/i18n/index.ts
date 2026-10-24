import { zhCN } from "./catalog";

export type UiLocale = "zh-CN" | "en";
export const UI_LOCALE_KEY = "t3code:ui-locale:v1";
let sessionLocale: UiLocale | undefined;

export function readUiLocale(): UiLocale {
  if (sessionLocale) return sessionLocale;
  try {
    const saved = globalThis.localStorage?.getItem(UI_LOCALE_KEY);
    if (saved === "en" || saved === "zh-CN") return (sessionLocale = saved);
  } catch {
    // A restricted browser must still render without changing user data.
  }
  // Existing component tests use English fixtures; product defaults to Chinese.
  return (sessionLocale = import.meta.env?.MODE === "test" ? "en" : "zh-CN");
}

export function writeUiLocale(locale: UiLocale): void {
  localStorage.setItem(UI_LOCALE_KEY, locale);
}

/** Only application-authored copy calls this function. User content never passes through it. */
export function uiText(
  source: string,
  values?: Readonly<Record<string, unknown>>,
  locale: UiLocale = readUiLocale(),
): string {
  const translated = locale === "zh-CN" ? (zhCN[source] ?? source) : source;
  if (!values) return translated;
  return translated.replace(/\{([A-Za-z0-9_]+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
