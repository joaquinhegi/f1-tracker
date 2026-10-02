import { describe, expect, it } from "vitest";
import { countdownTo } from "./countdown";

const at = (iso: string) => new Date(iso);

describe("countdownTo", () => {
  it("splits the remaining time into units", () => {
    expect(countdownTo(at("2026-10-04T07:00:00Z"), at("2026-10-02T04:58:30Z"))).toEqual({
      totalMs: 180_090_000, days: 2, hours: 2, minutes: 1, seconds: 30, isOver: false,
    });
  });

  it("rounds partial seconds up so it hits zero exactly at start", () => {
    const c = countdownTo(at("2026-10-04T07:00:00Z"), at("2026-10-04T06:59:59.200Z"));
    expect([c.minutes, c.seconds, c.isOver]).toEqual([0, 1, false]);
    expect(countdownTo(at("2026-10-04T07:00:00Z"), at("2026-10-04T07:00:00Z")).isOver).toBe(true);
  });

  it("never goes negative", () => {
    const c = countdownTo(at("2026-10-04T07:00:00Z"), at("2026-10-04T08:00:00Z"));
    expect(c).toMatchObject({ totalMs: 0, days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true });
  });

  it("counts absolute time across a DST change (Europe, 25 Oct 2026)", () => {
    // 24 h of real time even though local clocks in Europe repeat an hour.
    const c = countdownTo(at("2026-10-25T12:00:00Z"), at("2026-10-24T12:00:00Z"));
    expect([c.days, c.hours]).toEqual([1, 0]);
  });
});
