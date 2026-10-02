import { describe, expect, it } from "vitest";
import type { LocationSample } from "./car-position";
import { classifyCar, isParked } from "./car-state";

// Racing line along y = 0; pit lane 130 units (13 m) beside it, like Kuala Lumpur.
const track = [{ x: -10_000, y: 0 }, { x: 10_000, y: 0 }, { x: 10_000, y: -5_000 }, { x: -10_000, y: -5_000 }];
const pitLane = [{ x: -4_000, y: 0 }, { x: -3_000, y: 130 }, { x: 3_000, y: 130 }, { x: 4_000, y: 0 }];
const withLane = { track, pitLane };
const noLane = { track, pitLane: null };

/** Samples every 270 ms from t0 for `ms`, at the position given by `at(t)`. */
function samples(t0: number, ms: number, at: (t: number) => { x: number; y: number }): LocationSample[] {
  const out: LocationSample[] = [];
  for (let t = t0; t <= t0 + ms; t += 270) out.push({ t, ...at(t) });
  return out;
}

describe("classifyCar", () => {
  it("puts a car with no position in the garage (before its first run, retired, feed lost)", () => {
    expect(classifyCar([], 1_000, withLane)).toEqual({ kind: "garage" });
    const early = samples(60_000, 30_000, (t) => ({ x: t / 10, y: 0 }));
    expect(classifyCar(early, 10_000, withLane)).toEqual({ kind: "garage" });
  });

  it("follows a car on track", () => {
    const fast = samples(0, 60_000, (t) => ({ x: -9_000 + t / 10, y: 0 }));
    expect(classifyCar(fast, 30_000, withLane).kind).toBe("track");
  });

  it("follows a car driving the pit lane, with its arc length along the lane", () => {
    const pit = samples(0, 60_000, (t) => ({ x: -2_000 + t / 50, y: 128 }));
    const state = classifyCar(pit, 30_000, withLane);
    expect(state.kind).toBe("pit");
    if (state.kind === "pit") expect(state.along).toBeGreaterThan(1_000);
  });

  it("parks a car sitting in its box (drift of a unit or two) in the garage", () => {
    const parked = samples(0, 120_000, (t) => ({ x: 581 + (t > 60_000 ? 1 : 0), y: 140 }));
    expect(classifyCar(parked, 60_000, withLane)).toEqual({ kind: "garage" });
  });

  it("keeps a short halt in the lane (race stop, exit queue) as 'pit'", () => {
    const halt = [
      ...samples(0, 10_000, (t) => ({ x: -2_000 + t / 50, y: 130 })),
      ...samples(10_270, 8_000, () => ({ x: -1_800, y: 130 })),
      ...samples(18_540, 10_000, (t) => ({ x: -1_800 + (t - 18_540) / 50, y: 130 })),
    ];
    expect(classifyCar(halt, 14_000, withLane).kind).toBe("pit");
  });

  it("keeps a car stopped on the racing line on track", () => {
    const stopped = samples(0, 120_000, () => ({ x: 5_000, y: 3 }));
    expect(classifyCar(stopped, 60_000, withLane).kind).toBe("track");
    expect(classifyCar(stopped, 60_000, noLane).kind).toBe("track");
  });

  it("without a known pit lane, parks a car stationary off the racing line", () => {
    const parked = samples(0, 120_000, () => ({ x: 581, y: 128 }));
    expect(classifyCar(parked, 60_000, noLane)).toEqual({ kind: "garage" });
  });
});

describe("isParked", () => {
  it("needs enough samples around t (live playback has little future)", () => {
    const few = samples(0, 10_000, () => ({ x: 0, y: 0 }));
    expect(isParked(few, 10_000, { x: 0, y: 0 })).toBe(false);
    const enough = samples(0, 20_000, () => ({ x: 0, y: 0 }));
    expect(isParked(enough, 20_000, { x: 0, y: 0 })).toBe(true);
  });
});
