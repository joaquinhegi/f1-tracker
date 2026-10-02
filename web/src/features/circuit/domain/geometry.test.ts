import { describe, expect, it } from "vitest";
import { boundsOf, signedArea, simplify } from "./geometry";

describe("simplify", () => {
  it("drops collinear points and keeps corners and endpoints", () => {
    const line = [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0.01 }, { x: 3, y: 0 },
      { x: 3, y: 1 }, { x: 3, y: 2 },
    ];
    expect(simplify(line, 0.1)).toEqual([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }]);
  });

  it("returns a copy for trivial inputs", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(simplify(pts, 1)).toEqual(pts);
  });
});

describe("boundsOf / signedArea", () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }];
  it("computes bounds", () => {
    expect(boundsOf(square)).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });
  it("is positive counter-clockwise (y up) and negative clockwise", () => {
    expect(signedArea(square)).toBe(50);
    expect(signedArea([...square].reverse())).toBe(-50);
  });
});

import { nearestOnPolyline, pointAlong, polylineLength } from "./geometry";

describe("polyline helpers", () => {
  const line = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
  it("measures open and closed polylines", () => {
    expect(polylineLength(line)).toBe(20);
    expect(polylineLength(line, true)).toBeCloseTo(20 + Math.SQRT2 * 10);
  });
  it("finds the nearest point with its arc length", () => {
    expect(nearestOnPolyline({ x: 12, y: 4 }, line)).toEqual({ point: { x: 10, y: 4 }, distance: 2, along: 14, segment: 1 });
    expect(nearestOnPolyline({ x: 5, y: 5 }, [], false)).toBeNull();
  });
  it("walks to an arc length, clamped to the ends", () => {
    expect(pointAlong(line, 15)).toEqual({ point: { x: 10, y: 5 }, direction: { x: 0, y: 1 } });
    expect(pointAlong(line, -3).point).toEqual({ x: 0, y: 0 });
    expect(pointAlong(line, 99).point).toEqual({ x: 10, y: 10 });
  });
});
