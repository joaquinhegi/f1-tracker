import { describe, expect, it } from "vitest";
import { isCleanLap, referenceLapWindows, type LapTiming } from "./reference-lap";

const lap = (overrides: Partial<LapTiming>): LapTiming => ({
  driverNumber: 1,
  lapNumber: 2,
  start: new Date("2026-10-02T08:03:28.326Z"),
  durationSeconds: 99.029,
  sectorSeconds: [25.521, 32.999, 40.509],
  isPitOutLap: false,
  ...overrides,
});

describe("isCleanLap", () => {
  it("rejects pit-out laps and laps with missing timing", () => {
    expect(isCleanLap(lap({}))).toBe(true);
    expect(isCleanLap(lap({ isPitOutLap: true }))).toBe(false);
    expect(isCleanLap(lap({ durationSeconds: null }))).toBe(false);
    expect(isCleanLap(lap({ start: null }))).toBe(false);
    expect(isCleanLap(lap({ sectorSeconds: [null, 33, 40] }))).toBe(false);
  });
});

describe("referenceLapWindows", () => {
  it("orders clean laps fastest first and drops slow (in-lap / yellow) ones", () => {
    const laps = [
      lap({ lapNumber: 3, durationSeconds: 160.306 }), // cool-down lap, > 107%
      lap({ lapNumber: 2, durationSeconds: 99.029 }),
      lap({ lapNumber: 5, driverNumber: 16, durationSeconds: 97.5 }),
      lap({ lapNumber: 1, isPitOutLap: true, durationSeconds: null }),
    ];
    const windows = referenceLapWindows(laps);
    expect(windows.map((w) => [w.driverNumber, w.lapNumber])).toEqual([[16, 5], [1, 2]]);
  });

  it("windows span [date_start, date_start + lap_duration)", () => {
    const [w] = referenceLapWindows([lap({})]);
    expect(w.from.toISOString()).toBe("2026-10-02T08:03:28.326Z");
    expect(w.to.toISOString()).toBe("2026-10-02T08:05:07.355Z");
  });

  it("returns nothing without clean laps", () => {
    expect(referenceLapWindows([lap({ isPitOutLap: true })])).toEqual([]);
  });
});

import { pitStopWindows } from "./reference-lap";

describe("pitStopWindows", () => {
  const lap = (driverNumber: number, lapNumber: number, start: string | null, isPitOutLap = false) => ({
    driverNumber, lapNumber, start: start ? new Date(start) : null, durationSeconds: 100, sectorSeconds: [30, 30, 40], isPitOutLap,
  });
  it("spans in-lap start to a few minutes after the out lap starts, shortest first", () => {
    const laps = [
      lap(1, 9, "2026-10-02T04:50:13Z"), lap(1, 10, "2026-10-02T05:04:09Z", true),
      lap(16, 4, "2026-10-02T04:40:00Z"), lap(16, 5, "2026-10-02T04:45:00Z", true),
      lap(5, 1, "2026-10-02T04:30:00Z", true), // first out lap: no in lap
      lap(44, 3, "2026-10-02T04:00:00Z"), lap(44, 4, "2026-10-02T05:00:00Z", true), // > 25 min
    ];
    const windows = pitStopWindows(laps);
    expect(windows.map((w) => [w.driverNumber, w.lapNumber])).toEqual([[16, 5], [1, 10]]);
    expect(windows[0].from.toISOString()).toBe("2026-10-02T04:40:00.000Z");
    expect(windows[0].to.toISOString()).toBe("2026-10-02T04:49:00.000Z");
  });
});
