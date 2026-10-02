import { boundsOf, distance, simplify, type Bounds, type Point } from "./geometry";
import type { PitLane } from "./pit-lane";
import type { TrackSectors } from "./track-sectors";

export interface OutlineSource {
  sessionKey: number;
  sessionName: string;
  year: number;
  driverNumber: number;
  lapNumber: number;
}

export interface StartFinish {
  /** Raw-frame position of the timing line (where the lap starts). */
  point: Point;
  /** Unit vector of the direction of travel at the line, raw frame. */
  direction: Point;
}

/** A circuit drawn from one clean lap, in OpenF1 raw coordinates. */
export interface TrackOutline {
  circuitKey: number;
  points: Point[];
  bounds: Bounds;
  startFinish: StartFinish | null;
  source: OutlineSource;
  builtAt: string;
  /**
   * The pit lane, derived from a pit stop in the same frame. undefined: not
   * derived yet (outlines cached before pit lanes existed); null: no stop in
   * the data traced a usable lane, so cars park beside the start/finish line.
   */
  pitLane?: PitLane | null;
  /**
   * S1/S2 and S2/S3 boundaries from the source lap's sector times. undefined:
   * not derived yet (outlines cached before sectors existed); null: they
   * could not be placed, so the map draws a single-colour track.
   */
  sectors?: TrackSectors | null;
}

/** Fewer points than this after cleaning means the trace is not a usable lap. */
export const MIN_TRACE_POINTS = 50;

/**
 * Removes samples without a position. The feed reports (0, 0) for cars it
 * cannot place, and repeats positions while a car is stationary.
 */
export function cleanTrace(samples: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const p of samples) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    if (p.x === 0 && p.y === 0) continue;
    const prev = out.at(-1);
    if (prev && prev.x === p.x && prev.y === p.y) continue;
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * Lap start == timing line. The direction looks a few samples ahead so GPS-like
 * jitter right at the line does not skew it.
 */
export function deriveStartFinish(trace: readonly Point[], minDistance: number): StartFinish | null {
  if (trace.length < 2) return null;
  const origin = trace[0];
  const ahead = trace.find((p) => distance(p, origin) >= minDistance) ?? trace[trace.length - 1];
  const length = distance(ahead, origin);
  if (length === 0) return null;
  return {
    point: origin,
    direction: { x: (ahead.x - origin.x) / length, y: (ahead.y - origin.y) / length },
  };
}

export function buildTrackOutline(
  circuitKey: number,
  samples: readonly Point[],
  source: OutlineSource,
  builtAt: Date,
): TrackOutline | null {
  const trace = cleanTrace(samples);
  if (trace.length < MIN_TRACE_POINTS) return null;
  const bounds = boundsOf(trace);
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  // ~0.1% of the track's size: invisible at any reasonable render size.
  const points = simplify(trace, span * 0.001);
  return {
    circuitKey,
    points,
    bounds,
    startFinish: deriveStartFinish(trace, span * 0.02),
    source,
    builtAt: builtAt.toISOString(),
  };
}
