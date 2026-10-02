import { describe, expect, it } from "vitest";
import { nearestOnPolyline } from "@/features/circuit/domain/geometry";
import { createTrackTransform, projectPoint } from "@/features/circuit/domain/track-transform";
import { buildMapLayout, pitPose } from "./map-layout";

// Raw frame: a rectangle circuit, pit lane 130 units inside the bottom straight.
const points = [{ x: -5_000, y: 0 }, { x: 5_000, y: 0 }, { x: 5_000, y: 6_000 }, { x: -5_000, y: 6_000 }];
const transform = createTrackTransform({ minX: -5_000, minY: 0, maxX: 5_000, maxY: 6_000 });
const pitLane = { points: [{ x: -4_000, y: 0 }, { x: -3_000, y: 130 }, { x: 3_000, y: 130 }, { x: 4_000, y: 0 }], boxes: { from: 2_000, to: 6_000 } };
const startFinish = { point: projectPoint(transform, { x: 0, y: 0 }), direction: { x: 1, y: 0 } };
const drivers = [{ number: 1, teamName: "McLaren" }, { number: 81, teamName: "McLaren" }, { number: 44, teamName: "Ferrari" }];
const trackSvg = points.map((p) => projectPoint(transform, p));

describe("buildMapLayout", () => {
  it("parks every car in a box beside the drawn lane, off the track", () => {
    const layout = buildMapLayout({ outline: { transform, points, startFinish, pitLane }, drivers, carUnits: 30, pxPerUnit: 0.8 });
    expect(layout.lane).not.toBeNull();
    expect(layout.rail).toBeNull();
    expect(layout.parking.size).toBe(3);
    for (const spot of layout.parking.values()) {
      expect(nearestOnPolyline(spot.point, trackSvg, true)!.distance).toBeGreaterThan(15);
    }
    expect(pitPose(layout, 5_000)).not.toBeNull();
  });

  it("falls back to a garage rail beside the start/finish line without a pit lane", () => {
    const layout = buildMapLayout({ outline: { transform, points, startFinish, pitLane: null }, drivers, carUnits: 30, pxPerUnit: 0.8 });
    expect(layout.lane).toBeNull();
    expect(layout.rail).not.toBeNull();
    expect(layout.parking.size).toBe(3);
    for (const spot of layout.parking.values()) {
      expect(nearestOnPolyline(spot.point, trackSvg, true)!.distance).toBeGreaterThan(15);
    }
    expect(pitPose(layout, 100)).toBeNull();
  });

  it("shrinks parked cars to fit many boxes", () => {
    const many = Array.from({ length: 22 }, (_, i) => ({ number: i + 1, teamName: `T${Math.floor(i / 2)}` }));
    const layout = buildMapLayout({ outline: { transform, points, startFinish, pitLane }, drivers: many, carUnits: 60, pxPerUnit: 0.33 });
    expect(layout.parkedScale).toBeLessThan(1);
    expect(layout.parkedLabels).toBe(false);
  });
});
