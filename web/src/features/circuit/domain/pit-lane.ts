/**
 * Deriving a circuit's pit lane from one car's location trace around a pit
 * stop. Pure.
 *
 * What the OpenF1 `location` feed looks like around a stop (checked on the
 * 2026 Kuala Lumpur practice sessions, 11727 / 11728): the car leaves the
 * reference racing line at pit entry, drives the lane at ~220 units/s
 * (80 km/h; units are ~decimetres), then sends the same position (+-1-2
 * units of drift) for as long as it sits in its box, and later drives out to
 * pit exit and rejoins the racing line. So the lane is the trace from the
 * last on-track sample before the stop to the first on-track sample after it.
 */
import { distance, nearestOnPolyline, polylineLength, simplify, type Point } from "./geometry";

export interface TimedPoint extends Point {
  /** Epoch ms. */
  t: number;
}

export interface PitLaneSource {
  sessionKey: number;
  driverNumber: number;
  /** The pit-out lap whose stop traced the lane. */
  lapNumber: number;
}

/** A pit lane in raw OpenF1 coordinates, from pit entry to pit exit. */
export interface PitLane {
  points: Point[];
  /** Arc length (raw units along `points`) of the stretch that holds the pit boxes. */
  boxes: { from: number; to: number };
  source: PitLaneSource;
}

/** A car is parked when it stays within this radius (3 m)... */
export const STOP_RADIUS = 30;
/**
 * ...for at least this long. A race stop lasts ~2-3 s, a practice garage stay
 * minutes; the longest halt of the window anchors the lane (any halt inside
 * the lane works: the walks to the track trace the rest).
 */
export const STOP_MIN_MS = 2_000;
/** Within this distance (2.5 m) of the reference lap a sample is back on the racing line... */
export const ON_TRACK_DISTANCE = 25;
/** ...once it stays there this long. */
export const ON_TRACK_HOLD_MS = 2_000;
/** Lane walks give up past this: the trace is not a plain stop. */
export const MAX_WALK_MS = 150_000;
/** A derived lane shorter than this (150 m) is noise. */
export const MIN_LANE_LENGTH = 1_500;
/** Pit boxes sit where the lane runs at about the same distance from the track as the stop. */
const BOX_DISTANCE_RATIO: readonly [number, number] = [0.7, 1.3];
/** The box stretch spans at least this share of the lane. */
const MIN_BOX_SHARE = 0.3;

export interface Stop {
  /** First and last index of the parked samples. */
  start: number;
  end: number;
  point: Point;
}

/** The longest run of parked samples (see STOP_RADIUS / STOP_MIN_MS), or null. */
export function findLongestStop(samples: readonly TimedPoint[]): Stop | null {
  let best: Stop | null = null;
  let anchor = 0;
  const consider = (start: number, end: number) => {
    if (end <= start || samples[end].t - samples[start].t < STOP_MIN_MS) return;
    if (!best || samples[end].t - samples[start].t > samples[best.end].t - samples[best.start].t) {
      best = { start, end, point: { x: samples[start].x, y: samples[start].y } };
    }
  };
  for (let i = 1; i < samples.length; i++) {
    if (distance(samples[i], samples[anchor]) > STOP_RADIUS) {
      consider(anchor, i - 1);
      anchor = i;
    }
  }
  consider(anchor, samples.length - 1);
  return best;
}

/**
 * Walks from `from` in `step` direction until the car has been back on the
 * racing line for ON_TRACK_HOLD_MS; returns the first sample of that on-track
 * stretch (the junction with the track), or null.
 */
function walkToTrack(samples: readonly TimedPoint[], track: readonly Point[], from: number, step: 1 | -1): number | null {
  let onTrackSince: number | null = null;
  for (let i = from; i >= 0 && i < samples.length; i += step) {
    if (Math.abs(samples[i].t - samples[from].t) > MAX_WALK_MS) return null;
    const d = nearestOnPolyline(samples[i], track, true)?.distance ?? Infinity;
    if (d > ON_TRACK_DISTANCE) {
      onTrackSince = null;
      continue;
    }
    onTrackSince ??= i;
    if (Math.abs(samples[i].t - samples[onTrackSince].t) >= ON_TRACK_HOLD_MS) return onTrackSince;
  }
  return null;
}

function dedupe(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const prev = out.at(-1);
    if (prev && prev.x === p.x && prev.y === p.y) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * The stretch of the lane holding the boxes: around the stop, where the lane
 * keeps roughly the stop's distance from the track (the entry and exit roads
 * converge onto the track, the box straight runs parallel to it).
 */
export function boxStretch(lane: readonly Point[], track: readonly Point[], stop: Point): { from: number; to: number } {
  const length = polylineLength(lane);
  const hit = nearestOnPolyline(stop, lane);
  const centre = hit?.along ?? length / 2;
  const stopDistance = nearestOnPolyline(stop, track, true)?.distance ?? 0;
  const along: number[] = [0];
  for (let i = 1; i < lane.length; i++) along.push(along[i - 1] + distance(lane[i - 1], lane[i]));
  const fits = (i: number) => {
    const d = nearestOnPolyline(lane[i], track, true)?.distance ?? 0;
    return d >= stopDistance * BOX_DISTANCE_RATIO[0] && d <= stopDistance * BOX_DISTANCE_RATIO[1];
  };
  let from = centre;
  let to = centre;
  const startIndex = hit ? hit.segment : 0;
  for (let i = startIndex; i >= 0 && fits(i); i--) from = along[i];
  for (let i = startIndex + 1; i < lane.length && fits(i); i++) to = along[i];
  // Never narrower than MIN_BOX_SHARE of the lane, never on the very ends.
  const minSpan = length * MIN_BOX_SHARE;
  if (to - from < minSpan) {
    const mid = (from + to) / 2;
    from = mid - minSpan / 2;
    to = mid + minSpan / 2;
  }
  const lo = length * 0.05;
  const hi = length * 0.95;
  return { from: Math.max(lo, Math.min(from, hi - minSpan)), to: Math.min(hi, Math.max(to, lo + minSpan)) };
}

/**
 * The pit lane traced by one car's stop: from the junction before the stop
 * to the junction after it, simplified (0.5 m). null when the samples hold no
 * stop, the car never rejoins the racing line, or the lane is implausibly short.
 */
export function buildPitLane(samples: readonly TimedPoint[], track: readonly Point[], source: PitLaneSource): PitLane | null {
  const clean = samples.filter((s) => Number.isFinite(s.x) && Number.isFinite(s.y) && !(s.x === 0 && s.y === 0));
  if (track.length < 3 || clean.length < 10) return null;
  const stop = findLongestStop(clean);
  if (!stop) return null;
  const entry = walkToTrack(clean, track, stop.start, -1);
  const exit = walkToTrack(clean, track, stop.end, 1);
  if (entry === null || exit === null) return null;
  const trace = dedupe([...clean.slice(entry, stop.start + 1), ...clean.slice(stop.end, exit + 1)]);
  const points = simplify(trace, 5);
  if (points.length < 2 || polylineLength(points) < MIN_LANE_LENGTH) return null;
  return { points, boxes: boxStretch(points, track, stop.point), source };
}
