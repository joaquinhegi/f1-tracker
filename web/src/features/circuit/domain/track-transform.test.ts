import { describe, expect, it } from "vitest";
import { signedArea } from "./geometry";
import { createTrackTransform, projectPoint, toSvgPath, viewBoxOf } from "./track-transform";

const bounds = { minX: -5000, minY: -2000, maxX: 5000, maxY: 3000 };

describe("track transform", () => {
  const t = createTrackTransform(bounds, { width: 1000, padding: 50 });

  it("preserves aspect ratio (10000 x 5000 raw -> 900 x 450 + padding)", () => {
    expect(t.scale).toBeCloseTo(0.09);
    expect(t.height).toBe(550);
    expect(viewBoxOf(t)).toBe("0 0 1000 550");
  });

  it("maps the raw corners to the padded viewBox corners, flipping y", () => {
    expect(projectPoint(t, { x: -5000, y: 3000 })).toEqual({ x: 50, y: 50 }); // top-left
    expect(projectPoint(t, { x: 5000, y: -2000 })).toEqual({ x: 950, y: 500 }); // bottom-right
  });

  it("keeps the circuit's handedness on screen (no mirroring)", () => {
    // Clockwise in the y-up raw frame (like Monza)...
    const clockwise = [{ x: 0, y: 0 }, { x: 0, y: 1000 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }];
    const screen = clockwise.map((p) => projectPoint(t, p));
    // ...must still look clockwise on a y-down screen: signed area in y-down is positive for clockwise.
    expect(signedArea(clockwise)).toBeLessThan(0);
    expect(signedArea(screen)).toBeGreaterThan(0);
  });

  it("builds a closed path", () => {
    const path = toSvgPath(t, [{ x: -5000, y: 3000 }, { x: 5000, y: -2000 }]);
    expect(path).toBe("M50.0 50.0 L950.0 500.0 Z");
  });
});
