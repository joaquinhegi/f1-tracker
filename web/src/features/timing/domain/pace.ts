/**
 * Race pace: the mean of a driver's last PACE_LAPS clean laps.
 *
 * A lap is clean when it has a time, is not a pit-out lap, is not a pit-in
 * lap (the lap of a `pit` record), and is not slower than 107% of the
 * driver's median lap (that drops safety-car, VSC, red-flag and cool-down
 * laps). The median is taken over the driver's timed laps excluding pit
 * laps. At least MIN_PACE_LAPS clean laps are needed, otherwise no pace.
 */
import type { Lap } from "./timing";

export const PACE_LAPS = 5;
export const MIN_PACE_LAPS = 3;
export const SLOW_LAP_FACTOR = 1.07;

export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** `laps`: one driver's completed laps; `pitInLaps`: that driver's in-lap numbers. */
export function cleanLaps(laps: readonly Lap[], pitInLaps: ReadonlySet<number>): Lap[] {
  const timed = laps.filter(
    (lap) => lap.duration !== null && !lap.isPitOutLap && !pitInLaps.has(lap.lapNumber),
  );
  const reference = median(timed.map((lap) => lap.duration as number));
  if (reference === null) return [];
  return timed.filter((lap) => (lap.duration as number) <= reference * SLOW_LAP_FACTOR);
}

export function racePace(laps: readonly Lap[], pitInLaps: ReadonlySet<number>): number | null {
  const clean = cleanLaps(laps, pitInLaps).sort((a, b) => a.lapNumber - b.lapNumber);
  if (clean.length < MIN_PACE_LAPS) return null;
  const recent = clean.slice(-PACE_LAPS);
  return recent.reduce((sum, lap) => sum + (lap.duration as number), 0) / recent.length;
}
