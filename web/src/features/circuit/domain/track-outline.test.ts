import { describe, expect, it } from "vitest";
import { buildTrackOutline, cleanTrace, deriveStartFinish } from "./track-outline";

const source = { sessionKey: 1, sessionName: "Practice 2", year: 2026, driverNumber: 1, lapNumber: 2 };

/** Samples on a circle, clockwise in the raw y-up frame, starting at the bottom. */
function circleTrace(n: number, r = 1000) {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 - (2 * Math.PI * i) / n;
    return { x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)) };
  });
}

describe("cleanTrace", () => {
  it("drops (0,0) no-fix samples and consecutive duplicates", () => {
    expect(cleanTrace([{ x: 0, y: 0 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }])).toEqual([
      { x: 5, y: 5 }, { x: 6, y: 5 },
    ]);
  });
});

describe("deriveStartFinish", () => {
  it("uses the first sample and the direction of travel", () => {
    const sf = deriveStartFinish([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 0 }], 5);
    expect(sf).toEqual({ point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } });
  });
});

describe("buildTrackOutline", () => {
  it("builds a simplified outline with bounds and start/finish", () => {
    const outline = buildTrackOutline(12, circleTrace(360), source, new Date("2026-10-02T10:00:00Z"));
    expect(outline).not.toBeNull();
    expect(outline!.points.length).toBeLessThan(360);
    expect(outline!.points.length).toBeGreaterThan(20);
    expect(outline!.bounds).toEqual({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 });
    expect(outline!.startFinish!.point).toEqual({ x: 0, y: -1000 });
    expect(outline!.startFinish!.direction.x).toBeLessThan(0); // clockwise from the bottom -> heading left
    expect(outline!.builtAt).toBe("2026-10-02T10:00:00.000Z");
  });

  it("rejects traces that are too short to be a lap", () => {
    expect(buildTrackOutline(12, circleTrace(20), source, new Date())).toBeNull();
  });
});
