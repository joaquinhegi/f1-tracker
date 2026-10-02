/**
 * Splitting a circuit outline into its three timing sectors. Pure.
 *
 * The outline is drawn from one clean lap whose first sample is the lap
 * start (the start/finish line), so arc length 0 on the closed outline is the
 * S3 -> S1 boundary. The other two boundaries are where the same car was at
 * lap start + S1 and lap start + S1 + S2: its position at that time
 * (interpolated between samples) is projected onto the outline.
 */
import { distance, polylineLength, type Point } from "./geometry";
import type { TimedPoint } from "./pit-lane";

export interface SectorBoundary {
  /** Arc length (raw units) along the closed outline from its first point. */
  along: number;
  /** Raw-frame point on the outline. */
  point: Point;
  /** Unit direction of travel there, raw frame. */
  direction: Point;
}

/** The S1/S2 and S2/S3 boundaries; the start/finish line closes S3 -> S1. */
export interface TrackSectors {
  boundaries: [SectorBoundary, SectorBoundary];
  /** Closed outline length (raw units), so `along` can be read as a share. */
  length: number;
}

export interface SectorLap {
  /** Epoch ms of the lap start. */
  startMs: number;
  /** Sector durations in seconds. */
  sectorSeconds: readonly [number, number, number];
}

/** A sector shorter than this share of the lap means the split is wrong. */
export const MIN_SECTOR_SHARE = 0.08;
/** The projection only looks this share of the lap around the expected spot (crossovers, close parallel straights). */
export const SEARCH_WINDOW_SHARE = 0.12;
/** No sample within this long of the boundary time: the car position there is a guess. */
export const MAX_SAMPLE_GAP_MS = 2_000;

/** Position at `t` interpolated between the two samples around it. null outside the trace or across a gap. */
export function positionAt(samples: readonly TimedPoint[], t: number): Point | null {
  if (samples.length === 0 || t < samples[0].t || t > samples[samples.length - 1].t) return null;
  let lo = 0;
  let hi = samples.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  if (a.t === t) return { x: a.x, y: a.y };
  if (b.t === t) return { x: b.x, y: b.y };
  if (b.t - a.t > MAX_SAMPLE_GAP_MS) return null;
  const k = b.t === a.t ? 0 : (t - a.t) / (b.t - a.t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Distance driven along the trace from its first sample to `t` (interpolated). */
export function distanceDrivenAt(samples: readonly TimedPoint[], t: number): number {
  let driven = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    if (b.t <= t) {
      driven += distance(a, b);
      continue;
    }
    if (a.t < t) driven += distance(a, b) * ((t - a.t) / (b.t - a.t));
    break;
  }
  return driven;
}

/** Shortest distance between two arc lengths on a loop of length `length`. */
export function circularGap(a: number, b: number, length: number): number {
  const d = Math.abs(a - b) % length;
  return Math.min(d, length - d);
}

/**
 * Closest point of the closed outline to `p`, among the stretches within
 * `window` (arc length) of `hint`. The window keeps a crossover or a parallel
 * straight from capturing the point; it wraps around the start/finish line.
 */
export function projectNear(p: Point, outline: readonly Point[], hint: number, window: number): SectorBoundary | null {
  const n = outline.length;
  if (n < 2) return null;
  const length = polylineLength(outline, true);
  let best: (SectorBoundary & { distance: number }) | null = null;
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const segment = Math.hypot(dx, dy);
    if (segment > 0) {
      const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (segment * segment)));
      const at = along + k * segment;
      if (circularGap(at, hint, length) <= window) {
        const q = { x: a.x + k * dx, y: a.y + k * dy };
        const d = distance(p, q);
        if (!best || d < best.distance) {
          best = { along: at % length, point: q, direction: { x: dx / segment, y: dy / segment }, distance: d };
        }
      }
    }
    along += segment;
  }
  if (!best) return null;
  return { along: best.along, point: best.point, direction: best.direction };
}

/**
 * The sector boundaries of the outline drawn from `samples` (the reference
 * lap's trace, time-sorted). null when the lap or the trace cannot place them
 * reliably; the map then draws a single-colour track.
 */
export function deriveTrackSectors(
  samples: readonly TimedPoint[],
  lap: SectorLap,
  outline: readonly Point[],
): TrackSectors | null {
  const [s1, s2, s3] = lap.sectorSeconds;
  if (![s1, s2, s3].every((s) => Number.isFinite(s) && s > 0) || outline.length < 3) return null;
  const trace = samples.filter((s) => !(s.x === 0 && s.y === 0));
  if (trace.length < 2) return null;
  const length = polylineLength(outline, true);
  if (length === 0) return null;

  const lapEnd = lap.startMs + (s1 + s2 + s3) * 1000;
  const driven = distanceDrivenAt(trace, Math.min(lapEnd, trace[trace.length - 1].t));
  if (driven === 0) return null;

  const boundaryAt = (seconds: number): SectorBoundary | null => {
    const t = lap.startMs + seconds * 1000;
    const p = positionAt(trace, t);
    if (!p) return null;
    // Where the car should be on the outline: its share of the lap distance.
    const hint = (distanceDrivenAt(trace, t) / driven) * length;
    return projectNear(p, outline, hint, length * SEARCH_WINDOW_SHARE);
  };
  const first = boundaryAt(s1);
  const second = boundaryAt(s1 + s2);
  if (!first || !second) return null;

  const minimum = length * MIN_SECTOR_SHARE;
  if (first.along < minimum || second.along - first.along < minimum || length - second.along < minimum) return null;
  return { boundaries: [first, second], length };
}

/**
 * The closed outline cut into the three sectors, each an open polyline in
 * travel order: [0, b1], [b1, b2], [b2, start/finish].
 */
export function splitIntoSectors(outline: readonly Point[], sectors: TrackSectors): [Point[], Point[], Point[]] {
  const closed = [...outline, outline[0]];
  const cuts = [0, sectors.boundaries[0].along, sectors.boundaries[1].along, Infinity];
  const parts: [Point[], Point[], Point[]] = [[], [], []];
  let along = 0;
  let part = 0;
  parts[0].push(closed[0]);
  for (let i = 1; i < closed.length; i++) {
    const a = closed[i - 1];
    const b = closed[i];
    const segment = distance(a, b);
    // Cut every boundary that falls inside this segment.
    while (part < 2 && cuts[part + 1] <= along + segment) {
      const k = segment === 0 ? 0 : (cuts[part + 1] - along) / segment;
      const q = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
      parts[part].push(q);
      part += 1;
      parts[part].push(q);
    }
    parts[part].push(b);
    along += segment;
  }
  return parts;
}
