import { describe, expect, it } from "vitest";
import { polylineLength, type Point } from "./geometry";
import type { TimedPoint } from "./pit-lane";
import {
  circularGap,
  deriveTrackSectors,
  distanceDrivenAt,
  positionAt,
  projectNear,
  splitIntoSectors,
} from "./track-sectors";

const START = 1_000_000;

/** An 80 s lap at 4 Hz, constant speed, counter-clockwise on a 3000 x 2000 ellipse starting at (3000, 0). */
function lapTrace(n = 320, durationMs = 80_000): TimedPoint[] {
  return Array.from({ length: n + 1 }, (_, i) => ({
    t: START + (i * durationMs) / n,
    x: 3000 * Math.cos((2 * Math.PI * i) / n),
    y: 3000 * Math.sin((2 * Math.PI * i) / n),
  }));
}

/** The outline as the outline builder keeps it: every 4th sample (simplified), first sample at the line. */
const outlineOf = (trace: readonly TimedPoint[]): Point[] =>
  trace.slice(0, -1).filter((_, i) => i % 4 === 0).map(({ x, y }) => ({ x, y }));

describe("positionAt", () => {
  const samples: TimedPoint[] = [
    { t: 0, x: 0, y: 0 },
    { t: 1000, x: 10, y: 20 },
    { t: 5000, x: 50, y: 20 },
  ];

  it("interpolates between the samples around the time", () => {
    expect(positionAt(samples, 250)).toEqual({ x: 2.5, y: 5 });
    expect(positionAt(samples, 1000)).toEqual({ x: 10, y: 20 });
  });

  it("is null outside the trace and across a gap in the data", () => {
    expect(positionAt(samples, -1)).toBeNull();
    expect(positionAt(samples, 5001)).toBeNull();
    expect(positionAt(samples, 3000)).toBeNull(); // 4 s between samples
  });
});

describe("distanceDrivenAt", () => {
  it("sums the trace up to the time, interpolating the last segment", () => {
    const samples: TimedPoint[] = [
      { t: 0, x: 0, y: 0 },
      { t: 1000, x: 10, y: 0 },
      { t: 2000, x: 10, y: 10 },
    ];
    expect(distanceDrivenAt(samples, 1500)).toBeCloseTo(15);
    expect(distanceDrivenAt(samples, 9999)).toBeCloseTo(20);
  });
});

describe("circularGap", () => {
  it("measures the short way round the loop", () => {
    expect(circularGap(10, 90, 100)).toBe(20);
    expect(circularGap(40, 60, 100)).toBe(20);
    expect(circularGap(0, 100, 100)).toBe(0);
  });
});

describe("projectNear", () => {
  // A hairpin: out along y = 0, back along y = 10 (closed by the 10-unit return).
  const hairpin: Point[] = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 10 },
    { x: 0, y: 10 },
  ];

  it("picks the stretch near the expected arc length, not the closest one overall", () => {
    const p = { x: 50, y: 4 }; // closer to the outward straight
    expect(projectNear(p, hairpin, 50, 30)!.point).toEqual({ x: 50, y: 0 });
    const back = projectNear(p, hairpin, 160, 30)!;
    expect(back.point).toEqual({ x: 50, y: 10 });
    expect(back.along).toBeCloseTo(160);
    expect(back.direction).toEqual({ x: -1, y: 0 });
  });

  it("wraps around the start/finish line", () => {
    // Hint just before the end of the 220-unit loop; the point sits on the closing segment.
    const hit = projectNear({ x: -1, y: 5 }, hairpin, 218, 10)!;
    expect(hit.point).toEqual({ x: 0, y: 5 });
    expect(hit.along).toBeCloseTo(215);
  });
});

describe("deriveTrackSectors", () => {
  const trace = lapTrace();
  const outline = outlineOf(trace);
  const length = polylineLength(outline, true);

  it("places the boundaries where the car was at the sector times", () => {
    const sectors = deriveTrackSectors(trace, { startMs: START, sectorSeconds: [20, 30, 30] }, outline)!;
    expect(sectors.length).toBeCloseTo(length);
    expect(sectors.boundaries[0].along / length).toBeCloseTo(0.25, 2);
    expect(sectors.boundaries[1].along / length).toBeCloseTo(0.625, 2);
    // A quarter lap counter-clockwise from (3000, 0): the top of the circle, heading -x.
    expect(sectors.boundaries[0].point.x).toBeCloseTo(0, -1);
    expect(sectors.boundaries[0].point.y).toBeCloseTo(3000, -2);
    expect(sectors.boundaries[0].direction.x).toBeLessThan(-0.9);
  });

  it("follows the distance driven, not the elapsed share, when the speed varies", () => {
    // Slow first half (60 s), fast second half (20 s): 30 s in is a quarter of the distance.
    const uneven = trace.map((p, i) => ({
      ...p,
      t: i <= 160 ? START + (i * 60_000) / 160 : START + 60_000 + ((i - 160) * 20_000) / 160,
    }));
    const sectors = deriveTrackSectors(uneven, { startMs: START, sectorSeconds: [30, 40, 10] }, outline)!;
    expect(sectors.boundaries[0].along / length).toBeCloseTo(0.25, 2);
    expect(sectors.boundaries[1].along / length).toBeCloseTo(0.75, 2);
  });

  it("gives up on missing or implausible sector times", () => {
    expect(deriveTrackSectors(trace, { startMs: START, sectorSeconds: [0, 40, 40] }, outline)).toBeNull();
    expect(deriveTrackSectors(trace, { startMs: START, sectorSeconds: [2, 39, 39] }, outline)).toBeNull();
    expect(deriveTrackSectors(trace, { startMs: START, sectorSeconds: [Number.NaN, 40, 40] }, outline)).toBeNull();
  });

  it("gives up when the trace does not cover the boundary times", () => {
    const late = trace.filter((p) => p.t > START + 30_000);
    expect(deriveTrackSectors(late, { startMs: START, sectorSeconds: [20, 30, 30] }, outline)).toBeNull();
  });
});

describe("splitIntoSectors", () => {
  it("cuts the closed outline into three consecutive polylines that add up to the lap", () => {
    const trace = lapTrace();
    const outline = outlineOf(trace);
    const sectors = deriveTrackSectors(trace, { startMs: START, sectorSeconds: [20, 30, 30] }, outline)!;
    const [s1, s2, s3] = splitIntoSectors(outline, sectors);
    const near = (p: Point | undefined, q: Point) => {
      expect(p!.x).toBeCloseTo(q.x, 6);
      expect(p!.y).toBeCloseTo(q.y, 6);
    };
    near(s1[0], outline[0]);
    near(s1.at(-1), sectors.boundaries[0].point);
    near(s2[0], sectors.boundaries[0].point);
    near(s2.at(-1), sectors.boundaries[1].point);
    near(s3[0], sectors.boundaries[1].point);
    near(s3.at(-1), outline[0]);
    const total = polylineLength(s1) + polylineLength(s2) + polylineLength(s3);
    expect(total).toBeCloseTo(sectors.length);
    expect(polylineLength(s1)).toBeCloseTo(sectors.boundaries[0].along);
  });
});
