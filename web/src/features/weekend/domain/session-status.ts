import { sortByStart, type SessionStatus, type WeekendSession } from "./weekend";

/** Status of a session at `now`. Live is [start, end); the end is the published one. */
export function sessionStatus(session: WeekendSession, now: Date): SessionStatus {
  if (session.isCancelled) return "cancelled";
  const t = now.getTime();
  if (t < session.start.getTime()) return "upcoming";
  if (t < session.end.getTime()) return "live";
  return "finished";
}

/**
 * Session to focus by default: the live one, else the next upcoming one,
 * else the last finished one (weekend over -> replay the race).
 */
export function defaultSelectedSession(
  sessions: readonly WeekendSession[],
  now: Date,
): WeekendSession | null {
  const sorted = sortByStart(sessions);
  const live = sorted.find((s) => sessionStatus(s, now) === "live");
  if (live) return live;
  const next = sorted.find((s) => sessionStatus(s, now) === "upcoming");
  if (next) return next;
  const finished = sorted.filter((s) => sessionStatus(s, now) === "finished");
  return finished.at(-1) ?? null;
}

/** Finished sessions can be replayed; live ones are followed live. */
export function isSelectable(status: SessionStatus): boolean {
  return status !== "cancelled";
}
