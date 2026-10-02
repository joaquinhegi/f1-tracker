import { describe, expect, it } from "vitest";
import { cleanLaps, median, racePace } from "./pace";
import type { Lap } from "./timing";

const lap = (lapNumber: number, duration: number | null, isPitOutLap = false): Lap => ({
  driverNumber: 1, lapNumber, start: lapNumber * 100_000, sectors: [null, null, null], duration, isPitOutLap,
});

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("racePace", () => {
  it("is the mean of the last five clean laps", () => {
    const laps = [90, 91, 92, 93, 94, 95, 96].map((d, i) => lap(i + 1, d));
    expect(racePace(laps, new Set())).toBeCloseTo((92 + 93 + 94 + 95 + 96) / 5);
  });

  it("excludes pit in/out laps, slow (>107% of median) laps and untimed laps", () => {
    const laps = [lap(1, 90), lap(2, 90.4), lap(3, 120), lap(4, 110, true), lap(5, 90.2), lap(6, null), lap(7, 100), lap(8, 90.6)];
    // lap 3 = in-lap, lap 4 = out-lap, lap 7 = 100 > 107% of the median (90.4)
    expect(cleanLaps(laps, new Set([3])).map((l) => l.lapNumber)).toEqual([1, 2, 5, 8]);
    expect(racePace(laps, new Set([3]))).toBeCloseTo((90 + 90.4 + 90.2 + 90.6) / 4);
  });

  it("needs at least three clean laps", () => {
    expect(racePace([lap(1, 90), lap(2, 91)], new Set())).toBeNull();
    expect(racePace([], new Set())).toBeNull();
  });
});
