import { describe, expect, it } from "vitest";
import { polylineLength, type Point } from "./geometry";
import { boxStretch, buildPitLane, findLongestStop, type TimedPoint } from "./pit-lane";

/** A long straight track along y = 0 (closed as a thin loop far away). */
const track: Point[] = [
  { x: -10_000, y: 0 }, { x: 10_000, y: 0 }, { x: 10_000, y: -5_000 }, { x: -10_000, y: -5_000 },
];
const source = { sessionKey: 1, driverNumber: 1, lapNumber: 5 };

/**
 * A car on the straight (fast), into a pit lane 130 units (13 m) off the
 * track at pit speed, parked 60 s at x = 0, then out and back on track:
 * the shape seen in the 2026 Kuala Lumpur practice data.
 */
function stopTrace(): TimedPoint[] {
  const out: TimedPoint[] = [];
  let t = 0;
  const push = (x: number, y: number, dt: number) => {
    t += dt;
    out.push({ t, x, y });
  };
  for (let x = -9_000; x < -4_000; x += 200) push(x, 0, 270); // 740 u/s on track
  for (let x = -4_000; x < -3_000; x += 60) push(x, ((x + 4_000) / 1_000) * 130, 270); // entry road
  for (let x = -3_000; x < 0; x += 60) push(x, 130, 270); // pit lane, 220 u/s
  for (let i = 0; i < 220; i++) push(i % 2, 130, 270); // parked ~60 s, 1 unit of drift
  for (let x = 0; x < 3_000; x += 60) push(x, 130, 270);
  for (let x = 3_000; x < 4_000; x += 60) push(x, 130 - ((x - 3_000) / 1_000) * 130, 270); // exit road
  for (let x = 4_000; x < 9_000; x += 200) push(x, 0, 270);
  return out;
}

describe("findLongestStop", () => {
  it("finds the parked stretch despite drift, and ignores moving samples", () => {
    const trace = stopTrace();
    const stop = findLongestStop(trace)!;
    expect(trace[stop.end].t - trace[stop.start].t).toBeGreaterThan(55_000);
    expect(stop.point.y).toBe(130);
    expect(findLongestStop(trace.filter((p) => p.y === 0))).toBeNull();
  });
});

describe("buildPitLane", () => {
  it("traces the lane from the entry junction to the exit junction", () => {
    const lane = buildPitLane(stopTrace(), track, source)!;
    expect(lane).not.toBeNull();
    expect(lane.points[0].x).toBeLessThanOrEqual(-3_800);
    expect(lane.points.at(-1)!.x).toBeGreaterThanOrEqual(3_800);
    // Joins the track at both ends, runs 130 off it in the middle.
    expect(Math.abs(lane.points[0].y)).toBeLessThanOrEqual(25);
    expect(lane.points.some((p) => p.y === 130)).toBe(true);
    expect(polylineLength(lane.points)).toBeGreaterThan(7_500);
    expect(lane.source).toEqual(source);
  });

  it("puts the boxes on the stretch parallel to the track, around the stop", () => {
    const lane = buildPitLane(stopTrace(), track, source)!;
    const length = polylineLength(lane.points);
    expect(lane.boxes.from).toBeGreaterThan(length * 0.05);
    expect(lane.boxes.to).toBeLessThan(length * 0.95);
    // The parallel part spans x -3000..3000 of a ~8000 lane.
    expect(lane.boxes.to - lane.boxes.from).toBeGreaterThan(5_000);
  });

  it("gives up without a stop, when the car never rejoins the track, or on (0, 0) samples", () => {
    const trace = stopTrace();
    expect(buildPitLane(trace.filter((p) => p.y === 0), track, source)).toBeNull();
    expect(buildPitLane(trace.filter((p) => p.x < 3_500), track, source)).toBeNull();
    expect(buildPitLane(trace.map((p) => ({ ...p, x: 0, y: 0 })), track, source)).toBeNull();
  });
});

describe("boxStretch", () => {
  it("never collapses to a point, even when the stop is off the lane's parallel part", () => {
    const lane = [{ x: 0, y: 0 }, { x: 1_000, y: 500 }, { x: 2_000, y: 0 }];
    const stretch = boxStretch(lane, track, { x: 1_000, y: 500 });
    expect(stretch.to - stretch.from).toBeGreaterThanOrEqual(polylineLength(lane) * 0.3 - 1e-6);
  });
});
