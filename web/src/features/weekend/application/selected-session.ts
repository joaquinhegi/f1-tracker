import type { WeekendOverviewDto } from "./weekend-dto";

/**
 * The session the page shows: `?session=<key>` when it belongs to this
 * weekend and is not cancelled, otherwise the overview's default (live, else
 * next, else last finished).
 */
export function resolveSelectedSessionKey(overview: WeekendOverviewDto, raw: string | string[] | undefined): number | null {
  const key = Number(Array.isArray(raw) ? raw[0] : raw);
  const match = overview.sessions.find((s) => s.key === key && !s.isCancelled);
  return match ? match.key : overview.selectedSessionKey;
}

/** `?t=<seconds>`: where a replay starts. Ignored unless a non-negative number. */
export function parseReplayOffset(raw: string | string[] | undefined): number | undefined {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return raw !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined;
}
