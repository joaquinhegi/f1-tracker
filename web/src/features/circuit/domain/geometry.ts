/** Planar geometry helpers for track outlines. Pure. */

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function boundsOf(points: readonly Point[]): Bounds {
  if (points.length === 0) throw new Error("boundsOf: no points");
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return distance(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / length;
}

/** Ramer-Douglas-Peucker polyline simplification (iterative, keeps endpoints). */
export function simplify(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 2 || epsilon <= 0) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpendicularDistance(points[i], points[first], points[last]);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > epsilon) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/**
 * Shoelace signed area in a y-up (math) frame: > 0 counter-clockwise,
 * < 0 clockwise.
 */
export function signedArea(points: readonly Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export interface PolylineHit {
  /** Closest point on the polyline. */
  point: Point;
  distance: number;
  /** Arc length from the first vertex to `point`. */
  along: number;
  /** Index of the segment [i, i + 1] that holds `point`. */
  segment: number;
}

/** Total length of an open polyline (pass `closed` to include the last -> first segment). */
export function polylineLength(points: readonly Point[], closed = false): number {
  let length = 0;
  const n = points.length;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) length += distance(points[i], points[(i + 1) % n]);
  return length;
}

/** Closest point of a polyline to `p`, with its arc length. null for an empty polyline. */
export function nearestOnPolyline(p: Point, points: readonly Point[], closed = false): PolylineHit | null {
  const n = points.length;
  if (n === 0) return null;
  if (n === 1) return { point: points[0], distance: distance(p, points[0]), along: 0, segment: 0 };
  let best: PolylineHit | null = null;
  let along = 0;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const k = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
    const q = { x: a.x + k * dx, y: a.y + k * dy };
    const d = distance(p, q);
    if (!best || d < best.distance) best = { point: q, distance: d, along: along + k * Math.sqrt(lengthSq), segment: i };
    along += Math.sqrt(lengthSq);
  }
  return best;
}

/** Point and unit direction at arc length `s` of an open polyline (clamped to its ends). */
export function pointAlong(points: readonly Point[], s: number): { point: Point; direction: Point } {
  if (points.length === 0) throw new Error("pointAlong: no points");
  if (points.length === 1) return { point: points[0], direction: { x: 1, y: 0 } };
  let remaining = Math.max(0, s);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = distance(a, b);
    if (length === 0) continue;
    const last = i === points.length - 2;
    if (remaining <= length || last) {
      const k = Math.min(1, remaining / length);
      return {
        point: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
        direction: { x: (b.x - a.x) / length, y: (b.y - a.y) / length },
      };
    }
    remaining -= length;
  }
  const a = points[points.length - 2];
  const b = points[points.length - 1];
  const length = distance(a, b) || 1;
  return { point: b, direction: { x: (b.x - a.x) / length, y: (b.y - a.y) / length } };
}
