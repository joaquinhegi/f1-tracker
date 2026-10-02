/** Team radio domain. Pure TypeScript: no framework, no I/O. */

export interface RadioMessage {
  driverNumber: number;
  /** Epoch ms. */
  date: number;
  recordingUrl: string;
  /** Lap the car was on when the message was published, if known. */
  lapNumber: number | null;
}

/** Recordings are only played from F1's own static archive. */
export const RECORDING_HOSTS = new Set(["livetiming.formula1.com"]);

export function isAllowedRecordingUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && RECORDING_HOSTS.has(parsed.hostname);
  } catch {
    return false;
  }
}

/** The lap in progress at `date`: the last lap that started at or before it. */
export function lapNumberAt(lapStarts: ReadonlyArray<{ lapNumber: number; start: number | null }>, date: number): number | null {
  let lap: number | null = null;
  let lapStart = -Infinity;
  for (const { lapNumber, start } of lapStarts) {
    if (start === null || start > date) continue;
    if (start > lapStart) {
      lapStart = start;
      lap = lapNumber;
    }
  }
  return lap;
}


/** The radio feed shows every driver ("all", the default) or one driver. */
export type RadioFilter = "all" | number;

const matches = (filter: RadioFilter) => (m: RadioMessage) => filter === "all" || m.driverNumber === filter;

/** The feed's messages published by `t`, oldest first (newest at the bottom). */
export function feedMessages(messages: readonly RadioMessage[], filter: RadioFilter, t: number): RadioMessage[] {
  return messages.filter((m) => matches(filter)(m) && m.date <= t).sort((a, b) => a.date - b.date);
}

/** Messages per driver over the whole session (for the picker and the grid). */
export function messageCounts(messages: readonly RadioMessage[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const m of messages) counts.set(m.driverNumber, (counts.get(m.driverNumber) ?? 0) + 1);
  return counts;
}

/**
 * Why the feed is empty at `t`:
 * - "none": the session has no message for this filter at all;
 * - "before-first": there are `total`, the first one comes later (jump to it).
 * null when the feed has something to show.
 */
export type FeedEmptyState = { kind: "none" } | { kind: "before-first"; total: number; first: RadioMessage };

export function feedEmptyState(messages: readonly RadioMessage[], filter: RadioFilter, t: number): FeedEmptyState | null {
  const mine = messages.filter(matches(filter));
  if (mine.length === 0) return { kind: "none" };
  if (mine.some((m) => m.date <= t)) return null;
  const first = mine.reduce((a, b) => (b.date < a.date ? b : a));
  return { kind: "before-first", total: mine.length, first };
}
