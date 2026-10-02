import { describe, expect, it } from "vitest";
import { buildTimingBoard, tyreAt } from "./timing-board";
import type { Lap, SessionTiming } from "./timing";

const T0 = Date.parse("2026-09-26T11:00:00Z");
const s = (seconds: number) => T0 + seconds * 1000;

/** 3 laps of 90 s (30/30/30) for car 1, car 44 slightly slower then faster in S2. */
function lap(driverNumber: number, lapNumber: number, startS: number, sectors: [number, number, number], isPitOutLap = false): Lap {
  return {
    driverNumber, lapNumber, start: s(startS), sectors,
    duration: sectors[0] + sectors[1] + sectors[2], isPitOutLap,
  };
}

const timing: SessionTiming = {
  laps: [
    lap(1, 1, 0, [30, 30, 30]),
    lap(1, 2, 90, [29.5, 30, 30]),
    lap(44, 1, 1, [30.5, 30.2, 30.1]),
    lap(44, 2, 91.8, [30.4, 29.0, 30.3]),
  ],
  stints: [
    { driverNumber: 1, stintNumber: 1, lapStart: 1, lapEnd: 20, compound: "MEDIUM", tyreAgeAtStart: 2 },
    { driverNumber: 44, stintNumber: 1, lapStart: 1, lapEnd: 1, compound: "SOFT", tyreAgeAtStart: 0 },
    { driverNumber: 44, stintNumber: 2, lapStart: 2, lapEnd: null, compound: "HARD", tyreAgeAtStart: 0 },
  ],
  positions: [
    { driverNumber: 1, date: s(0), position: 1 },
    { driverNumber: 44, date: s(0), position: 2 },
    { driverNumber: 44, date: s(500), position: 1 }, // in the future at the instants tested
  ],
  pits: [],
};

const intervals = [
  { driverNumber: 1, date: s(100), gapToLeader: null, interval: null },
  { driverNumber: 44, date: s(100), gapToLeader: { kind: "time" as const, seconds: 1.8 }, interval: { kind: "time" as const, seconds: 1.8 } },
  { driverNumber: 44, date: s(400), gapToLeader: null, interval: { kind: "time" as const, seconds: 9.9 } },
];

describe("buildTimingBoard", () => {
  it("shows only what happened up to t", () => {
    // t = 150 s: car 1 completed lap 1 and S1+S2 of lap 2; car 44 completed lap 1 and S1 of lap 2.
    const rows = buildTimingBoard({ timing, intervals, driverNumbers: [1, 44, 81], raceLike: true }, s(150));
    expect(rows.map((r) => [r.driverNumber, r.position, r.currentLap])).toEqual([
      [1, 1, 2],
      [44, 2, 2],
      [81, null, null],
    ]);
    const [leader, second, noData] = rows;
    expect(leader.lastLap).toEqual({ seconds: 90, mark: "overall-best", pitOut: false });
    // Overall bests by t: S1 29.5 (car 1), S2 30.0 (car 1, lap 1 and 2), S3 30.0 (car 1, lap 1).
    expect(leader.sectors.map((c) => c && [c.seconds, c.mark, c.previous])).toEqual([
      [29.5, "overall-best", false],
      [30, "overall-best", false],
      [30, "overall-best", true], // lap 2 has not reached S3 yet: lap 1's value
    ]);
    expect(second.sectors[0]).toEqual({ seconds: 30.4, mark: "personal-best", previous: false });
    expect(second.sectors[1]).toEqual({ seconds: 30.2, mark: "personal-best", previous: true });
    expect(leader.gapAhead).toBeNull();
    expect(leader.gapBehind).toEqual({ kind: "time", seconds: 1.8 });
    expect(second.gapAhead).toEqual({ kind: "time", seconds: 1.8 });
    expect(second.tyre).toEqual({ compound: "HARD", age: 0 });
    expect(leader.tyre).toEqual({ compound: "MEDIUM", age: 3 });
    expect(noData).toMatchObject({ lastLap: null, bestLap: null, tyre: null, sectors: [null, null, null] });
  });

  it("practice gaps come from best laps", () => {
    const rows = buildTimingBoard({ timing, intervals: [], driverNumbers: [1, 44], raceLike: false }, s(200));
    expect(rows[0].bestLap).toEqual({ seconds: 89.5, mark: "overall-best" });
    expect(rows[1].bestLap).toEqual({ seconds: 89.7, mark: "personal-best" });
    expect(rows[0].gapBehind?.kind).toBe("time");
    expect((rows[0].gapBehind as { seconds: number }).seconds).toBeCloseTo(0.2);
  });

  it("is empty-safe before the session starts", () => {
    const rows = buildTimingBoard({ timing, intervals, driverNumbers: [1], raceLike: true }, s(-60));
    expect(rows.map((r) => [r.driverNumber, r.position, r.lastLap])).toEqual([
      [1, null, null],
      [44, null, null],
    ]);
  });
});

describe("tyreAt", () => {
  it("uses the latest stint started by that lap and ages it", () => {
    expect(tyreAt(timing.stints.filter((x) => x.driverNumber === 44), 5)).toEqual({ compound: "HARD", age: 3 });
    expect(tyreAt(timing.stints.filter((x) => x.driverNumber === 44), null)).toEqual({ compound: "SOFT", age: 0 });
    expect(tyreAt([], 3)).toBeNull();
  });
});

describe("practice ordering", () => {
  it("orders by best lap set by t, even when the position feed disagrees", () => {
    const practice: SessionTiming = {
      ...timing,
      positions: [
        { driverNumber: 44, date: s(0), position: 1 }, // feed says 44 leads
        { driverNumber: 1, date: s(0), position: 2 },
      ],
    };
    const rows = buildTimingBoard({ timing: practice, intervals: [], driverNumbers: [1, 44, 81], raceLike: false }, s(200));
    expect(rows.map((r) => [r.driverNumber, r.position])).toEqual([[1, 1], [44, 2], [81, null]]);
    expect((rows[1].gapAhead as { seconds: number }).seconds).toBeGreaterThan(0);
  });
});
