export interface Countdown {
  /** Milliseconds left, never negative. */
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isOver: boolean;
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Time left until `target`. Works on absolute instants, so DST changes and
 * the viewer's timezone never affect the result. Seconds are rounded up so
 * the display reaches 00:00:00 exactly when the session starts.
 */
export function countdownTo(target: Date, now: Date): Countdown {
  const totalMs = Math.max(0, target.getTime() - now.getTime());
  let rest = Math.ceil(totalMs / SECOND) * SECOND;
  const days = Math.floor(rest / DAY);
  rest -= days * DAY;
  const hours = Math.floor(rest / HOUR);
  rest -= hours * HOUR;
  const minutes = Math.floor(rest / MINUTE);
  rest -= minutes * MINUTE;
  const seconds = Math.floor(rest / SECOND);
  return { totalMs, days, hours, minutes, seconds, isOver: totalMs === 0 };
}
