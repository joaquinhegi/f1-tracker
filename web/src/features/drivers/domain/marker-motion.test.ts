import { describe, expect, it } from "vitest";
import { blendPose, headingDelta, LANE_TRANSITION_MS, PARK_TRANSITION_MS, transitionMs } from "./marker-motion";

describe("marker motion", () => {
  it("turns the short way round", () => {
    expect(headingDelta(170, -170)).toBe(20);
    expect(headingDelta(-170, 170)).toBe(-20);
    expect(headingDelta(0, 90)).toBe(90);
  });

  it("blends position, heading and scale from start to end", () => {
    const a = { x: 0, y: 0, heading: 170, scale: 1 };
    const b = { x: 100, y: 50, heading: -170, scale: 0.5 };
    expect(blendPose(a, b, 0)).toEqual(a);
    const end = blendPose(a, b, 1);
    expect(end).toMatchObject({ x: 100, y: 50, scale: 0.5 });
    expect(end.heading).toBeCloseTo(190);
    expect(blendPose(a, b, 0.5).x).toBeCloseTo(50);
  });

  it("glides longer into and out of the garage than between track and pit lane", () => {
    expect(transitionMs("track", "track")).toBe(0);
    expect(transitionMs("pit", "garage")).toBe(PARK_TRANSITION_MS);
    expect(transitionMs("garage", "track")).toBe(PARK_TRANSITION_MS);
    expect(transitionMs("track", "pit")).toBe(LANE_TRANSITION_MS);
  });
});
