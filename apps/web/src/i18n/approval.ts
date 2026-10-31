import { readUiLocale, uiText, type UiLocale } from ".";

/** Only recognized approval-option templates are translated; provider-specific copy stays intact. */
export function approvalOptionLabel(source: string, locale: UiLocale = readUiLocale()): string {
  const translated = uiText(source, undefined, locale);
  if (locale === "en" || translated !== source) return translated;

  const everyRequest = /^Allow every (.+) request this session$/.exec(source);
  if (everyRequest) {
    return uiText("Allow every {action} request this session", { action: everyRequest[1] }, locale);
  }
  const sessionTarget = /^Allow (.+) this session$/.exec(source);
  if (sessionTarget) {
    return uiText("Allow {target} this session", { target: sessionTarget[1] }, locale);
  }
  const alwaysTarget = /^Always allow (.+)$/.exec(source);
  if (alwaysTarget) {
    return uiText("Always allow {target}", { target: alwaysTarget[1] }, locale);
  }
  return source;
}
