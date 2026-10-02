/**
 * Where a car is at a given instant: on track, driving the pit lane, or
 * parked in the garage. Pure.
 *
 * What the OpenF1 `location` feed sends (checked on 2026 Kuala Lumpur FP1 /
 * FP2, sessions 11727 / 11728):
 * - Before a car's first run it reports (0, 0) (dropped by the BFF), so the
 *   car has no samples at all.
 * - In the garage it keeps sending the box position, +-1-2 units of drift,
 *   for minutes. At Kuala Lumpur the boxes are ~13 m from the racing line, so
 *   drawn raw the car sits on the main straight.
 * - It keeps reporting after the flag (cars return to their boxes); samples
 *   come every ~270 ms with no gaps above 1.3 s while a car is reported.
 *
 * Thresholds (raw units are ~decimetres):
 * - Parked: the car moved less than STILL_RADIUS (3 m) over the
 *   STILL_WINDOW_MS (+-15 s) around `t`, with at least MIN_STILL_COVERAGE_MS of
 *   samples (live playback has little future data). Short halts, like a pit
 *   exit queue under 30 s or a race stop, stay "pit".
 * - In the pit lane: within PIT_CORRIDOR (6 m) of the pit lane and closer to
 *   it than to the racing line.
 * - Garage: parked within GARAGE_REACH (15 m: boxes sit a few metres off the
 *   lane centre) of the pit lane and closer to it than to the racing line;
 *   when no pit lane is known, parked more than OFF_TRACK_DISTANCE (4 m) off
 *   the racing line. Also any car with no position at `t` (before its first
 *   run, after retiring, feed lost).
 *   A car parked on the racing line (stopped on track, grid) stays "track".
 */
import { nearestOnPolyline, type Point } from "@/features/circuit/domain/geometry";
import { positionAt, sampleIndexAt, type LocationSample } from "./car-position";

export const STILL_WINDOW_MS = 15_000;
export const STILL_RADIUS = 30;
export const MIN_STILL_COVERAGE_MS = 14_000;
export const PIT_CORRIDOR = 60;
export const OFF_TRACK_DISTANCE = 40;
export const GARAGE_REACH = 150;

export type CarState =
  | { kind: "track"; position: Point }
  /** `along`: arc length (raw units) along the pit lane polyline. */
  | { kind: "pit"; position: Point; along: number }
  | { kind: "garage" };

export interface CarStateContext {
  /** Closed racing line, raw coordinates. */
  track: readonly Point[];
  /** Pit lane polyline (entry -> exit), raw coordinates; null when unknown. */
  pitLane: readonly Point[] | null;
}

/** True when the car stayed within STILL_RADIUS of `here` over the window around `t`. */
export function isParked(samples: readonly LocationSample[], t: number, here: Point): boolean {
  const from = t - STILL_WINDOW_MS;
  const to = t + STILL_WINDOW_MS;
  let i = Math.max(0, sampleIndexAt(samples, from));
  let first: number | null = null;
  let last: number | null = null;
  for (; i < samples.length && samples[i].t <= to; i++) {
    const s = samples[i];
    if (s.t < from) continue;
    if (Math.hypot(s.x - here.x, s.y - here.y) > STILL_RADIUS) return false;
    first ??= s.t;
    last = s.t;
  }
  return first !== null && last !== null && last - first >= MIN_STILL_COVERAGE_MS;
}

export function classifyCar(samples: readonly LocationSample[], t: number, context: CarStateContext): CarState {
  const position = positionAt(samples, t);
  if (!position) return { kind: "garage" };

  const toTrack = nearestOnPolyline(position, context.track, true)?.distance ?? Infinity;
  const lane = context.pitLane ? nearestOnPolyline(position, context.pitLane) : null;
  const nearLane = lane !== null && lane.distance < toTrack;
  const inPitLane = nearLane && lane.distance <= PIT_CORRIDOR;

  if (isParked(samples, t, position)) {
    const inGarage = lane ? nearLane && lane.distance <= GARAGE_REACH : toTrack > OFF_TRACK_DISTANCE;
    if (inGarage) return { kind: "garage" };
  }
  if (inPitLane) return { kind: "pit", position, along: lane.along };
  return { kind: "track", position };
}
