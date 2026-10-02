/**
 * Date formatting in the viewer's timezone (or an explicit one, for tests
 * and SSR). Thin wrappers over Intl so components stay declarative.
 * UI copy is English, so dates default to en-GB (24 h clock, like F1 timing).
 */

export const DEFAULT_LOCALE = "en-GB";

export interface FormatOptions {
  timeZone?: string;
  locale?: string;
}

export function formatDay({ timeZone, locale = DEFAULT_LOCALE }: FormatOptions = {}) {
  return (date: Date) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", timeZone }).format(date);
}

export function formatTime({ timeZone, locale = DEFAULT_LOCALE }: FormatOptions = {}) {
  return (date: Date) =>
    new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

export function formatDateRange(start: Date, end: Date, { timeZone, locale = DEFAULT_LOCALE }: FormatOptions = {}): string {
  const format = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone });
  // ICU versions differ on the spacing around the range dash ("2–4" vs "2 – 4"),
  // which breaks hydration between Node and the browser: normalise it.
  return format.formatRange(start, end).replace(/\s*–\s*/g, " – ");
}

/** Short zone name of the viewer, e.g. "CEST" or "GMT+2". */
export function timeZoneLabel(date: Date, { timeZone, locale = DEFAULT_LOCALE }: FormatOptions = {}): string {
  const parts = new Intl.DateTimeFormat(locale, { timeZoneName: "short", timeZone }).formatToParts(date);
  return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
}

/** "14:03:12": timing-style wall clock with seconds. */
export function formatClockTime({ timeZone, locale = DEFAULT_LOCALE }: FormatOptions = {}) {
  return (date: Date) =>
    new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone }).format(date);
}
