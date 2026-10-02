/** Picking a clean lap whose car trace can draw the circuit. Pure. */

export interface LapTiming {
  driverNumber: number;
  lapNumber: number;
  start: Date | null;
  durationSeconds: number | null;
  sectorSeconds: ReadonlyArray<number | null>;
  isPitOutLap: boolean;
}

export interface LapWindow {
  driverNumber: number;
  lapNumber: number;
  from: Date;
  to: Date;
}

/** Laps slower than this ratio of the fastest one are likely in/out/yellow-flag laps. */
const MAX_RATIO_TO_FASTEST = 1.07;

export function isCleanLap(lap: LapTiming): boolean {
  return (
    !lap.isPitOutLap &&
    lap.start !== null &&
    lap.durationSeconds !== null &&
    lap.durationSeconds > 0 &&
    lap.sectorSeconds.length === 3 &&
    lap.sectorSeconds.every((s) => s !== null && s > 0)
  );
}

/**
 * Clean laps within 107% of the session's fastest clean lap, fastest first.
 * A pit-in lap is slow (pit lane), so the ratio filter drops it too.
 */
export function referenceLapWindows(laps: readonly LapTiming[], limit = 5): LapWindow[] {
  const clean = laps.filter(isCleanLap);
  if (clean.length === 0) return [];
  const fastest = Math.min(...clean.map((l) => l.durationSeconds!));
  return clean
    .filter((l) => l.durationSeconds! <= fastest * MAX_RATIO_TO_FASTEST)
    .sort((a, b) => a.durationSeconds! - b.durationSeconds!)
    .slice(0, limit)
    .map((l) => ({
      driverNumber: l.driverNumber,
      lapNumber: l.lapNumber,
      from: l.start!,
      to: new Date(l.start!.getTime() + l.durationSeconds! * 1000),
    }));
}

/** A stop trace spans in-lap start -> out-lap start + this (exit road and rejoin). */
const PIT_WINDOW_TAIL_MS = 4 * 60_000;
/** Longer garage stays make large location requests: skip them. */
const MAX_PIT_WINDOW_MS = 25 * 60_000;

/**
 * Windows that contain a whole pit stop: from the start of the in lap (the
 * lap before a pit-out lap) to a few minutes after the out lap starts.
 * Shortest first, so the cheapest traces are tried first.
 */
export function pitStopWindows(laps: readonly LapTiming[], limit = 4): LapWindow[] {
  const byKey = new Map(laps.map((l) => [`${l.driverNumber}:${l.lapNumber}`, l]));
  const windows: LapWindow[] = [];
  for (const out of laps) {
    if (!out.isPitOutLap || out.lapNumber <= 1 || !out.start) continue;
    const inLap = byKey.get(`${out.driverNumber}:${out.lapNumber - 1}`);
    if (!inLap?.start || inLap.start >= out.start) continue;
    const from = inLap.start;
    const to = new Date(out.start.getTime() + PIT_WINDOW_TAIL_MS);
    if (to.getTime() - from.getTime() > MAX_PIT_WINDOW_MS) continue;
    windows.push({ driverNumber: out.driverNumber, lapNumber: out.lapNumber, from, to });
  }
  return windows.sort((a, b) => a.to.getTime() - a.from.getTime() - (b.to.getTime() - b.from.getTime())).slice(0, limit);
}
