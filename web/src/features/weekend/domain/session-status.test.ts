import { describe, expect, it } from "vitest";
import { defaultSelectedSession, sessionStatus } from "./session-status";
import type { WeekendSession } from "./weekend";

const at = (iso: string) => new Date(iso);
const s = (key: number, start: string, end: string, isCancelled = false): WeekendSession => ({
  key, meetingKey: 1, name: `S${key}`, type: "Practice", kind: "other", start: at(start), end: at(end), isCancelled,
});

const FP1 = s(1, "2026-10-02T04:30:00Z", "2026-10-02T05:30:00Z");
const FP2 = s(2, "2026-10-02T08:00:00Z", "2026-10-02T09:00:00Z");
const RACE = s(3, "2026-10-04T07:00:00Z", "2026-10-04T09:00:00Z");

describe("sessionStatus", () => {
  it("is upcoming before start, live during [start, end), finished after", () => {
    expect(sessionStatus(FP1, at("2026-10-02T04:29:59Z"))).toBe("upcoming");
    expect(sessionStatus(FP1, at("2026-10-02T04:30:00Z"))).toBe("live");
    expect(sessionStatus(FP1, at("2026-10-02T05:29:59Z"))).toBe("live");
    expect(sessionStatus(FP1, at("2026-10-02T05:30:00Z"))).toBe("finished");
  });

  it("reports cancelled sessions as cancelled", () => {
    expect(sessionStatus({ ...FP1, isCancelled: true }, at("2026-10-01T00:00:00Z"))).toBe("cancelled");
  });
});

describe("defaultSelectedSession", () => {
  const all = [RACE, FP2, FP1]; // unsorted on purpose

  it("prefers the live session", () => {
    expect(defaultSelectedSession(all, at("2026-10-02T08:30:00Z"))?.key).toBe(2);
  });

  it("else the next upcoming one", () => {
    expect(defaultSelectedSession(all, at("2026-10-02T06:00:00Z"))?.key).toBe(2);
  });

  it("else the last finished one", () => {
    expect(defaultSelectedSession(all, at("2026-10-05T00:00:00Z"))?.key).toBe(3);
  });

  it("skips cancelled sessions when looking for the next one", () => {
    const cancelledFp2 = { ...FP2, isCancelled: true };
    expect(defaultSelectedSession([FP1, cancelledFp2, RACE], at("2026-10-02T06:00:00Z"))?.key).toBe(3);
  });
});
