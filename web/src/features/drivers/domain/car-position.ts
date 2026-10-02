/**
 * Where a car is at a given instant, from OpenF1 `location` samples
 * (~3.7 Hz per car). Pure: positions are linearly interpolated between the
 * two samples around `t`.
 */
import type { Point } from "@/features/circuit/domain/geometry";

export interface LocationSample {
  /** Epoch ms. */
  t: number;
  /** Raw OpenF1 coordinates (y up). */
  x: number;
  y: number;
}

/** Samples further apart than this are a data gap (garage, feed drop): no interpolation across it. */
export const MAX_SAMPLE_GAP_MS = 5_000;
/** How far past the last (or before the first) sample a car is still drawn. */
export const EDGE_TOLERANCE_MS = 1_500;

/** Index of the last sample at or before `t`, or -1. `samples` sorted by t. */
export function sampleIndexAt(samples: readonly LocationSample[], t: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].t <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export function positionAt(samples: readonly LocationSample[], t: number): Point | null {
  if (samples.length === 0) return null;
  const i = sampleIndexAt(samples, t);
  if (i === -1) {
    const first = samples[0];
    return first.t - t <= EDGE_TOLERANCE_MS ? { x: first.x, y: first.y } : null;
  }
  const a = samples[i];
  const b = samples[i + 1];
  if (!b) return t - a.t <= EDGE_TOLERANCE_MS ? { x: a.x, y: a.y } : null;
  const span = b.t - a.t;
  if (span > MAX_SAMPLE_GAP_MS) return t - a.t <= EDGE_TOLERANCE_MS ? { x: a.x, y: a.y } : null;
  const k = span === 0 ? 0 : (t - a.t) / span;
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
}

/** Below this distance (SVG units) the direction of travel is noise: keep the previous heading. */
export const MIN_HEADING_DISTANCE = 0.5;

/**
 * Heading in degrees for an SVG `rotate()`, from two points already in SVG
 * space (y down): 0 = pointing right (+x), 90 = pointing down.
 */
export function headingDegrees(from: Point, to: Point): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < MIN_HEADING_DISTANCE) return null;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}
