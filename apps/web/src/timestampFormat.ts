import { uiText } from "~/i18n";
import { readUiLocale, type UiLocale } from "~/i18n";
import { type TimestampFormat } from "@t3tools/contracts/settings";
function getTimestampFormatOptions(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormatOptions {
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  };
  if (timestampFormat === "locale") {
    return baseOptions;
  }
  return {
    ...baseOptions,
    hour12: timestampFormat === "12-hour",
  };
}
export function resolveTimestampLocale(
  systemLocale: string | null | undefined,
): string | undefined {
  const tag = systemLocale?.trim();
  if (!tag) return undefined;
  try {
    // Reject structurally invalid tags; let ICU fall back for valid tags it lacks data for.
    Intl.DateTimeFormat.supportedLocalesOf([tag]);
    return tag;
  } catch {
    return undefined;
  }
}
function readHostSystemLocale(): string | null {
  if (typeof window === "undefined") return null;
  return window.desktopBridge?.getSystemLocale?.() ?? null;
}
const timestampLocale =
  readUiLocale() === "zh-CN" ? "zh-CN" : resolveTimestampLocale(readHostSystemLocale());
const WEEKDAY_INDEXES = [0, 1, 2, 3, 4, 5, 6] as const;
type WeekdayIndex = (typeof WEEKDAY_INDEXES)[number];
type LocaleWithWeekInfo = Intl.Locale & {
  readonly weekInfo?: {
    readonly firstDay: number;
  };
  getWeekInfo?: () => {
    readonly firstDay: number;
  };
};
/**
 * First weekday of a locale as a `Date#getDay` index (0 is Sunday), or
 * `undefined` when the runtime has no week data, so callers keep their own
 * default.
 */
export function resolveWeekStartsOn(locale: string | undefined): WeekdayIndex | undefined {
  try {
    const resolved: LocaleWithWeekInfo = new Intl.Locale(
      locale ?? Intl.DateTimeFormat().resolvedOptions().locale,
    );
    // Week info counts Monday as 1 and Sunday as 7.
    const firstDay = resolved.getWeekInfo?.().firstDay ?? resolved.weekInfo?.firstDay;
    return firstDay === undefined ? undefined : WEEKDAY_INDEXES[firstDay % 7];
  } catch {
    return undefined;
  }
}
export const weekStartsOn = resolveWeekStartsOn(timestampLocale);
const timestampFormatterCache = new Map<string, Intl.DateTimeFormat>();
function getTimestampFormatter(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormat {
  const cacheKey = `${timestampFormat}:${includeSeconds ? "seconds" : "minutes"}`;
  const cachedFormatter = timestampFormatterCache.get(cacheKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }
  const formatter = new Intl.DateTimeFormat(
    timestampLocale,
    getTimestampFormatOptions(timestampFormat, includeSeconds),
  );
  timestampFormatterCache.set(cacheKey, formatter);
  return formatter;
}
export function resolveHour12(timestampFormat: TimestampFormat): boolean {
  return getTimestampFormatter(timestampFormat, false).resolvedOptions().hour12 ?? false;
}
export function parseTimestampDate(isoDate: string): Date | null {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}
// Deliberately not the host locale: the tooltip's ordinal suffix and
// day-before-month order below are English, so a localized month alone would
// read "4th Juni 2026".
const monthNameFormatter = new Intl.DateTimeFormat("en-US", { month: "long" });
function ordinalSuffix(day: number): string {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}
export function formatChatTimestampTooltip(
  isoDate: string,
  timestampFormat: TimestampFormat,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = formatShortTimestamp(isoDate, timestampFormat);
  if (readUiLocale() === "zh-CN")
    return `${time}，${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  const day = date.getDate();
  const month = monthNameFormatter.format(date);
  const year = date.getFullYear();
  return `${time}, ${day}${ordinalSuffix(day)} ${month} ${year}`;
}
export function formatShortTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, false).format(date);
}
const numericDateFormatter = new Intl.DateTimeFormat(timestampLocale, {
  month: "numeric",
  day: "numeric",
});
const numericDateWithYearFormatter = new Intl.DateTimeFormat(timestampLocale, {
  month: "numeric",
  day: "numeric",
  year: "numeric",
});
export function formatDayAwareTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  nowMs: number = Date.now(),
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = getTimestampFormatter(timestampFormat, false).format(date);
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  // Round so DST-shifted 23/25 hour days still count as whole days.
  const dayDiff = Math.round((startOfToday - startOfMessageDay) / 86400000);
  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return readUiLocale() === "zh-CN" ? `昨天 ${time}` : `yesterday at ${time}`;
  const dateFormatter =
    date.getFullYear() === now.getFullYear() ? numericDateFormatter : numericDateWithYearFormatter;
  return `${dateFormatter.format(date)} ${time}`;
}
export function formatUpcomingTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  nowMs: number = Date.now(),
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = getTimestampFormatter(timestampFormat, false).format(date);
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTargetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfTargetDay - startOfToday) / 86400000);
  if (dayDiff < 0) return formatDayAwareTimestamp(isoDate, timestampFormat, nowMs);
  if (dayDiff === 0) return time;
  if (dayDiff === 1) return readUiLocale() === "zh-CN" ? `明天 ${time}` : `tomorrow at ${time}`;
  const dateFormatter =
    date.getFullYear() === now.getFullYear() ? numericDateFormatter : numericDateWithYearFormatter;
  return `${dateFormatter.format(date)} ${time}`;
}
type RelativeTimeParts = {
  value: string;
  suffix: string | null;
};
export type RelativeTimeState =
  | {
      status: "missing";
    }
  | {
      status: "invalid";
    }
  | {
      status: "relative";
      value: string;
      suffix: string | null;
    };
const MINUTE_MS = 60000;
const HOUR_MS = 3600000;
const DAY_MS = 86400000;
function relativeTimeUnitMs(elapsedMs: number): number {
  if (elapsedMs < HOUR_MS) return MINUTE_MS;
  if (elapsedMs < DAY_MS) return HOUR_MS;
  return DAY_MS;
}
/** Elapsed time floored to formatRelativeTime precision; equal labels yield equal values. */
export function relativeTimeElapsedMs(isoDate: string, nowMs: number = Date.now()): number | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  const unitMs = relativeTimeUnitMs(elapsedMs);
  return Math.floor(elapsedMs / unitMs) * unitMs;
}
export function msUntilRelativeTimeChange(
  isoDate: string,
  nowMs: number = Date.now(),
): number | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const elapsedMs = Math.max(0, nowMs - date.getTime());
  const unitMs = relativeTimeUnitMs(elapsedMs);
  const nextChangeMs = date.getTime() + (Math.floor(elapsedMs / unitMs) + 1) * unitMs;
  // Delays above 2^31-1 fire immediately; cap safely and let callers reschedule.
  return Math.min(nextChangeMs - nowMs, DAY_MS);
}
export function formatRelativeElapsed(
  elapsedMs: number,
  locale: UiLocale = readUiLocale(),
): RelativeTimeParts {
  const zh = locale === "zh-CN";
  const seconds = Math.floor(elapsedMs / 1000);
  if (seconds < 60) return { value: zh ? "\u521A\u521A" : "just now", suffix: null };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return { value: `${minutes}${zh ? "\u5206\u949F" : "m"}`, suffix: zh ? "\u524D" : "ago" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return { value: `${hours}${zh ? "\u5C0F\u65F6" : "h"}`, suffix: zh ? "\u524D" : "ago" };
  const days = Math.floor(hours / 24);
  return { value: `${days}${zh ? "\u5929" : "d"}`, suffix: zh ? "\u524D" : "ago" };
}
export function formatRelativeTime(
  isoDate: string,
  nowMsOrLocale: number | UiLocale = Date.now(),
  locale: UiLocale = readUiLocale(),
): RelativeTimeParts | null {
  const nowMs = typeof nowMsOrLocale === "number" ? nowMsOrLocale : Date.now();
  const selectedLocale = typeof nowMsOrLocale === "string" ? nowMsOrLocale : locale;
  const elapsedMs = relativeTimeElapsedMs(isoDate, nowMs);
  return elapsedMs === null ? null : formatRelativeElapsed(elapsedMs, selectedLocale);
}
export function formatRelativeTimeLabel(
  isoDate: string,
  nowMsOrLocale: number | UiLocale = Date.now(),
) {
  const relative = formatRelativeTime(isoDate, nowMsOrLocale);
  if (!relative) return "";
  const zh = (typeof nowMsOrLocale === "string" ? nowMsOrLocale : readUiLocale()) === "zh-CN";
  return relative.suffix ? relative.value + (zh ? "" : " ") + relative.suffix : relative.value;
}
export function formatElapsedDurationLabel(isoDate: string, nowMs: number = Date.now()): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = nowMs - date.getTime();
  if (diffMs <= 0) return uiText("just now");
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return uiText("just now");
  if (seconds < 60) return `${seconds}${readUiLocale() === "zh-CN" ? "\u79D2" : "s"}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}${readUiLocale() === "zh-CN" ? "\u5206\u949F" : "m"}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}${readUiLocale() === "zh-CN" ? "\u5C0F\u65F6" : "h"}`;
  const days = Math.floor(hours / 24);
  return `${days}${readUiLocale() === "zh-CN" ? "\u5929" : "d"}`;
}
export function formatRelativeTimeUntil(isoDate: string): RelativeTimeParts | null {
  const date = parseTimestampDate(isoDate);
  if (!date) return null;
  const diffMs = date.getTime() - Date.now();
  if (diffMs <= 0) return { value: "Expired", suffix: null };
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return { value: "Soon", suffix: null };
  if (seconds < 60)
    return {
      value: `${seconds}${readUiLocale() === "zh-CN" ? "\u79D2" : "s"}`,
      suffix: readUiLocale() === "zh-CN" ? "\u540E\u5230\u671F" : "left",
    };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)
    return {
      value: `${minutes}${readUiLocale() === "zh-CN" ? "\u5206\u949F" : "m"}`,
      suffix: readUiLocale() === "zh-CN" ? "\u540E\u5230\u671F" : "left",
    };
  const hours = Math.floor(minutes / 60);
  if (hours < 24)
    return {
      value: `${hours}${readUiLocale() === "zh-CN" ? "\u5C0F\u65F6" : "h"}`,
      suffix: readUiLocale() === "zh-CN" ? "\u540E\u5230\u671F" : "left",
    };
  const days = Math.floor(hours / 24);
  return {
    value: `${days}${readUiLocale() === "zh-CN" ? "\u5929" : "d"}`,
    suffix: readUiLocale() === "zh-CN" ? "\u540E\u5230\u671F" : "left",
  };
}
export function formatRelativeTimeUntilLabel(isoDate: string): string {
  const relative = formatRelativeTimeUntil(isoDate);
  if (!relative) return "";
  return relative.suffix
    ? `${relative.value}${readUiLocale() === "zh-CN" ? "" : " "}${relative.suffix}`
    : relative.value;
}
/**
 * Pass `nowMs` when a parent tick drives re-renders so the diff matches that snapshot.
 */
export function formatExpiresInLabel(isoDate: string, nowMs: number = Date.now()): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const diffMs = date.getTime() - nowMs;
  if (diffMs <= 0) return uiText("Expired");
  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 5) return uiText("Expires in a moment");
  if (totalSeconds < 60) return uiText("Expires in {0}s", { "0": totalSeconds });
  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `Expires in ${minutes}m` : `Expires in ${minutes}m ${seconds}s`;
  }
  if (totalSeconds < 86400) {
    const hours = Math.floor(totalSeconds / 3600);
    const rem = totalSeconds % 3600;
    const minutes = Math.floor(rem / 60);
    const seconds = rem % 60;
    const parts = [`${hours}${readUiLocale() === "zh-CN" ? "\u5C0F\u65F6" : "h"}`];
    if (minutes > 0) parts.push(`${minutes}${readUiLocale() === "zh-CN" ? "\u5206\u949F" : "m"}`);
    if (seconds > 0) parts.push(`${seconds}${readUiLocale() === "zh-CN" ? "\u79D2" : "s"}`);
    return uiText("Expires in {0}", { "0": parts.join(" ") });
  }
  const days = Math.floor(totalSeconds / 86400);
  const remAfterDays = totalSeconds % 86400;
  if (remAfterDays === 0) return uiText("Expires in {0}d", { "0": days });
  const hours = Math.floor(remAfterDays / 3600);
  const rem = remAfterDays % 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem % 60;
  const tail: string[] = [];
  if (hours > 0) tail.push(`${hours}${readUiLocale() === "zh-CN" ? "\u5C0F\u65F6" : "h"}`);
  if (minutes > 0) tail.push(`${minutes}${readUiLocale() === "zh-CN" ? "\u5206\u949F" : "m"}`);
  if (seconds > 0) tail.push(`${seconds}${readUiLocale() === "zh-CN" ? "\u79D2" : "s"}`);
  return tail.length > 0
    ? `Expires in ${days}d ${tail.join(" ")}`
    : uiText("Expires in {0}d", { "0": days });
}
export function formatTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, true).format(date);
}
