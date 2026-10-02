import { describe, expect, it } from "vitest";
import { parseReplayOffset, resolveSelectedSessionKey } from "./selected-session";
import type { WeekendOverviewDto } from "./weekend-dto";

const session = (key: number, isCancelled = false) => ({
  key, meetingKey: 1, name: "Practice 1", shortLabel: "FP1", type: "Practice", kind: "practice-1" as const,
  start: "2026-10-02T04:30:00.000Z", end: "2026-10-02T05:30:00.000Z", isCancelled, status: "finished" as const,
});

const overview = { sessions: [session(1), session(2), session(3, true)], selectedSessionKey: 2 } as unknown as WeekendOverviewDto;

describe("resolveSelectedSessionKey", () => {
  it("uses ?session= when it is a session of this weekend", () => {
    expect(resolveSelectedSessionKey(overview, "1")).toBe(1);
    expect(resolveSelectedSessionKey(overview, ["1", "2"])).toBe(1);
  });

  it("falls back to the default otherwise", () => {
    expect(resolveSelectedSessionKey(overview, undefined)).toBe(2);
    expect(resolveSelectedSessionKey(overview, "999")).toBe(2);
    expect(resolveSelectedSessionKey(overview, "3")).toBe(2); // cancelled
    expect(resolveSelectedSessionKey(overview, "abc")).toBe(2);
  });
});

describe("parseReplayOffset", () => {
  it("accepts non-negative seconds only", () => {
    expect(parseReplayOffset("900")).toBe(900);
    expect(parseReplayOffset("0")).toBe(0);
    expect(parseReplayOffset("-1")).toBeUndefined();
    expect(parseReplayOffset("x")).toBeUndefined();
    expect(parseReplayOffset(undefined)).toBeUndefined();
  });
});
