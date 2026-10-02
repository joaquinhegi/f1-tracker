import { describe, expect, it } from "vitest";
import { formatGap, formatLapTime, parseGap } from "./gap";

describe("parseGap", () => {
  it.each([
    [0.523, { kind: "time", seconds: 0.523 }],
    ["+1 LAP", { kind: "laps", laps: 1 }],
    ["+3 LAPS", { kind: "laps", laps: 3 }],
    ["2L", { kind: "laps", laps: 2 }],
    ["+12.345", { kind: "time", seconds: 12.345 }],
    [null, null],
    [undefined, null],
    ["", null],
    ["DNF", null],
    [Number.NaN, null],
  ])("parses %s", (raw, expected) => {
    expect(parseGap(raw as never)).toEqual(expected);
  });
});

describe("formatGap", () => {
  it("formats times and laps", () => {
    expect(formatGap({ kind: "time", seconds: 0.5234 })).toBe("+0.523");
    expect(formatGap({ kind: "time", seconds: 15.25 })).toBe("+15.3");
    expect(formatGap({ kind: "time", seconds: -0.2 })).toBe("-0.200");
    expect(formatGap({ kind: "laps", laps: 1 })).toBe("+1 LAP");
    expect(formatGap({ kind: "laps", laps: 2 })).toBe("+2 LAPS");
    expect(formatGap(null)).toBe("—");
  });
});

describe("formatLapTime", () => {
  it("uses m:ss.sss above a minute", () => {
    expect(formatLapTime(88.1234)).toBe("1:28.123");
    expect(formatLapTime(65.004)).toBe("1:05.004");
    expect(formatLapTime(28.5)).toBe("28.500");
    expect(formatLapTime(null)).toBe("—");
  });
});
