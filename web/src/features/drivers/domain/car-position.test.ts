import { describe, expect, it } from "vitest";
import { headingDegrees, positionAt, sampleIndexAt, type LocationSample } from "./car-position";

const samples: LocationSample[] = [
  { t: 1000, x: 0, y: 0 },
  { t: 1270, x: 270, y: 0 },
  { t: 1540, x: 270, y: 270 },
  { t: 9000, x: 9000, y: 9000 }, // after a 7.5 s gap
];

describe("sampleIndexAt", () => {
  it("finds the last sample at or before t", () => {
    expect(sampleIndexAt(samples, 999)).toBe(-1);
    expect(sampleIndexAt(samples, 1000)).toBe(0);
    expect(sampleIndexAt(samples, 1300)).toBe(1);
    expect(sampleIndexAt(samples, 20_000)).toBe(3);
  });
});

describe("positionAt", () => {
  it("interpolates linearly between neighbouring samples", () => {
    expect(positionAt(samples, 1135)).toEqual({ x: 135, y: 0 });
    expect(positionAt(samples, 1405)).toEqual({ x: 270, y: 135 });
  });

  it("does not interpolate across a data gap", () => {
    expect(positionAt(samples, 2000)).toEqual({ x: 270, y: 270 }); // within tolerance of the last sample
    expect(positionAt(samples, 5000)).toBeNull();
  });

  it("only draws a car near the edges of the data", () => {
    expect(positionAt(samples, -1000)).toBeNull();
    expect(positionAt(samples, 500)).toEqual({ x: 0, y: 0 });
    expect(positionAt(samples, 10_000)).toEqual({ x: 9000, y: 9000 });
    expect(positionAt(samples, 11_000)).toBeNull();
    expect(positionAt([], 1000)).toBeNull();
  });
});

describe("headingDegrees", () => {
  it("measures the SVG direction of travel (y down)", () => {
    expect(headingDegrees({ x: 0, y: 0 }, { x: 10, y: 0 })).toBe(0);
    expect(headingDegrees({ x: 0, y: 0 }, { x: 0, y: 10 })).toBe(90);
    expect(headingDegrees({ x: 0, y: 0 }, { x: -10, y: 0 })).toBe(180);
  });

  it("ignores a stationary car", () => {
    expect(headingDegrees({ x: 5, y: 5 }, { x: 5.1, y: 5 })).toBeNull();
  });
});
