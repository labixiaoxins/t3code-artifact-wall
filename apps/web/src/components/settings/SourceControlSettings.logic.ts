import { uiText, type UiLocale } from "~/i18n";

export function sourceControlDetail(
  externalDetail: string | null,
  fallback: string,
  values?: Readonly<Record<string, unknown>>,
  locale?: UiLocale,
): string {
  return externalDetail ?? uiText(fallback, values, locale);
}
