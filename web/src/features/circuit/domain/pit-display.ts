/**
 * How the pit lane and the garages are drawn on the map, in SVG units. Pure.
 *
 * Real pit lanes run ~10-15 m from the racing line: at map scale that is
 * under the track's casing. The drawn lane keeps the real shape but is pushed
 * out to at least `minOffset` from the track, blending back to the real lane
 * at the entry and exit so cars join and leave the track smoothly. Cars in
 * the lane are placed by their arc length along the real lane, so they
 * follow the drawn one.
 */
import { distance, nearestOnPolyline, type Point } from "./geometry";

export interface DisplayLane {
  /** Drawn lane vertices, SVG units. */
  points: Point[];
  /** Arc length of the real (projected) lane at each vertex, SVG units. */
  along: number[];
  /** Unit normal at each vertex, pointing away from the track (towards the garages). */
  outward: Point[];
}

export interface LanePose {
  point: Point;
  /** Unit direction of travel. */
  direction: Point;
  outward: Point;
}

export interface ParkingSpot {
  point: Point;
  /** Degrees for an SVG rotate(): the parked car points at the lane / track. */
  heading: number;
}

/** Drawn vertices every this many SVG units, so the entry / exit blend is smooth. */
const RESAMPLE_STEP = 4;
/** The blend from the real lane to the pushed-out one, at each end. */
const TAPER_SHARE = 0.12;
const MAX_TAPER = 70;

const smoothstep = (x: number) => {
  const k = Math.max(0, Math.min(1, x));
  return k * k * (3 - 2 * k);
};

const headingOf = (v: Point) => (Math.atan2(v.y, v.x) * 180) / Math.PI;

function resample(points: readonly Point[], step: number): { points: Point[]; along: number[] } {
  const out: Point[] = [points[0]];
  const along: number[] = [0];
  let travelled = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = distance(a, b);
    if (length === 0) continue;
    const n = Math.max(1, Math.ceil(length / step));
    for (let k = 1; k <= n; k++) {
      const f = k / n;
      out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
      along.push(travelled + length * f);
    }
    travelled += length;
  }
  return { points: out, along };
}

function normalise(v: Point): Point {
  const length = Math.hypot(v.x, v.y);
  return length === 0 ? { x: 0, y: 0 } : { x: v.x / length, y: v.y / length };
}

/** The drawn pit lane: the real one (projected) pushed clear of the track by `minOffset`. */
export function displayPitLane(lane: readonly Point[], track: readonly Point[], minOffset: number): DisplayLane | null {
  if (lane.length < 2 || track.length < 3) return null;
  const { points, along } = resample(lane, RESAMPLE_STEP);
  const length = along[along.length - 1];
  const taper = Math.min(length * TAPER_SHARE, MAX_TAPER);
  const pushed = points.map((p, i) => {
    const hit = nearestOnPolyline(p, track, true)!;
    const away = normalise({ x: p.x - hit.point.x, y: p.y - hit.point.y });
    if (away.x === 0 && away.y === 0) return p;
    const w = taper === 0 ? 1 : smoothstep(Math.min(along[i], length - along[i]) / taper);
    const offset = hit.distance + (Math.max(hit.distance, minOffset) - hit.distance) * w;
    return { x: hit.point.x + away.x * offset, y: hit.point.y + away.y * offset };
  });
  // Nearest-track-point changes at corners make the push jitter: smooth it (ends stay put).
  const smooth = pushed.map((p, i) => {
    if (i < 2 || i > pushed.length - 3) return p;
    let x = 0;
    let y = 0;
    for (let k = -2; k <= 2; k++) {
      x += pushed[i + k].x;
      y += pushed[i + k].y;
    }
    return { x: x / 5, y: y / 5 };
  });
  const outward = smooth.map((p, i) => {
    const a = smooth[Math.max(0, i - 1)];
    const b = smooth[Math.min(smooth.length - 1, i + 1)];
    const dir = normalise({ x: b.x - a.x, y: b.y - a.y });
    const left = { x: -dir.y, y: dir.x };
    const hit = nearestOnPolyline(p, track, true)!;
    const side = left.x * (p.x - hit.point.x) + left.y * (p.y - hit.point.y);
    return side >= 0 ? left : { x: -left.x, y: -left.y };
  });
  return { points: smooth, along, outward };
}

/** Pose on the drawn lane at arc length `s` of the real lane (SVG units), clamped to its ends. */
export function laneAt(lane: DisplayLane, s: number): LanePose {
  const { points, along, outward } = lane;
  const last = points.length - 1;
  const at = Math.max(0, Math.min(s, along[last]));
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (along[mid] <= at) lo = mid;
    else hi = mid;
  }
  const span = along[hi] - along[lo];
  const k = span === 0 ? 0 : (at - along[lo]) / span;
  const a = points[lo];
  const b = points[hi];
  return {
    point: { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k },
    direction: normalise({ x: b.x - a.x, y: b.y - a.y }),
    outward: normalise({
      x: outward[lo].x + (outward[hi].x - outward[lo].x) * k,
      y: outward[lo].y + (outward[hi].y - outward[lo].y) * k,
    }),
  };
}

/**
 * Parking spot of a box: `fraction` (0..1) along the box stretch, `depth`
 * units out from the lane on the garage side, nose towards the lane.
 */
export function laneParking(lane: DisplayLane, boxes: { from: number; to: number }, fraction: number, depth: number): ParkingSpot {
  const pose = laneAt(lane, boxes.from + (boxes.to - boxes.from) * fraction);
  return {
    point: { x: pose.point.x + pose.outward.x * depth, y: pose.point.y + pose.outward.y * depth },
    heading: headingOf({ x: -pose.outward.x, y: -pose.outward.y }),
  };
}

/** Fallback garages: a straight rail beside the start/finish line, outside the track. */
export interface GarageRail {
  from: Point;
  to: Point;
  /** Unit normal pointing away from the track. */
  outward: Point;
}

/**
 * A rail of `length` units parallel to the start/finish straight, `offset`
 * units from the line: outside the circuit when it is clear of the track
 * there, else on the side with the most room, so parked cars never sit on
 * the circuit.
 */
export function garageRail(
  startFinish: { point: Point; direction: Point },
  track: readonly Point[],
  offset: number,
  length: number,
): GarageRail {
  const dir = normalise(startFinish.direction);
  const candidates = [
    { x: -dir.y, y: dir.x },
    { x: dir.y, y: -dir.x },
  ].map((outward) => {
    const centre = { x: startFinish.point.x + outward.x * offset, y: startFinish.point.y + outward.y * offset };
    const from = { x: centre.x - (dir.x * length) / 2, y: centre.y - (dir.y * length) / 2 };
    const to = { x: centre.x + (dir.x * length) / 2, y: centre.y + (dir.y * length) / 2 };
    const clearance = Math.min(
      ...[from, centre, to].map((p) => nearestOnPolyline(p, track, true)?.distance ?? Infinity),
    );
    return { rail: { from, to, outward }, clearance };
  });
  // Prefer the outside of the circuit (away from its centroid) while it has room.
  const centroid = track.reduce((c, p) => ({ x: c.x + p.x / track.length, y: c.y + p.y / track.length }), { x: 0, y: 0 });
  const toCentre = { x: centroid.x - startFinish.point.x, y: centroid.y - startFinish.point.y };
  const outsideFirst = [...candidates].sort(
    (a, b) => a.rail.outward.x * toCentre.x + a.rail.outward.y * toCentre.y - (b.rail.outward.x * toCentre.x + b.rail.outward.y * toCentre.y),
  );
  const roomy = outsideFirst.find((c) => c.clearance >= offset * 0.8);
  return (roomy ?? (candidates[0].clearance >= candidates[1].clearance ? candidates[0] : candidates[1])).rail;
}

export function railParking(rail: GarageRail, fraction: number): ParkingSpot {
  return {
    point: { x: rail.from.x + (rail.to.x - rail.from.x) * fraction, y: rail.from.y + (rail.to.y - rail.from.y) * fraction },
    heading: headingOf({ x: -rail.outward.x, y: -rail.outward.y }),
  };
}

