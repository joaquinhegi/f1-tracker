import { describe, expect, it } from "vitest";
import { feedEmptyState, feedMessages, isAllowedRecordingUrl, lapNumberAt, messageCounts, type RadioMessage } from "./radio";

describe("isAllowedRecordingUrl", () => {
  it("only accepts https URLs on the F1 livetiming host", () => {
    expect(isAllowedRecordingUrl("https://livetiming.formula1.com/static/2026/x/TeamRadio/NOR_1.mp3")).toBe(true);
    expect(isAllowedRecordingUrl("http://livetiming.formula1.com/static/a.mp3")).toBe(false);
    expect(isAllowedRecordingUrl("https://evil.example/a.mp3")).toBe(false);
    expect(isAllowedRecordingUrl("not a url")).toBe(false);
  });
});

describe("lapNumberAt", () => {
  const laps = [
    { lapNumber: 2, start: 2000 },
    { lapNumber: 1, start: 1000 },
    { lapNumber: 3, start: null },
  ];
  it("finds the lap in progress", () => {
    expect(lapNumberAt(laps, 1500)).toBe(1);
    expect(lapNumberAt(laps, 2000)).toBe(2);
    expect(lapNumberAt(laps, 999)).toBeNull();
    expect(lapNumberAt([], 1000)).toBeNull();
  });
});

describe("radio feed", () => {
  const m = (driverNumber: number, date: number): RadioMessage => ({ driverNumber, date, recordingUrl: `u${date}`, lapNumber: 2 });
  const all = [m(63, 900), m(81, 300), m(63, 500), m(5, 1500)];

  it("shows every driver by default, or one driver, up to the playhead", () => {
    expect(feedMessages(all, "all", 1000).map((x) => [x.driverNumber, x.date])).toEqual([[81, 300], [63, 500], [63, 900]]);
    expect(feedMessages(all, 63, 600).map((x) => x.date)).toEqual([500]);
    expect(feedMessages(all, 44, 5000)).toEqual([]);
  });

  it("counts messages per driver over the whole session", () => {
    expect(messageCounts(all)).toEqual(new Map([[63, 2], [81, 1], [5, 1]]));
    expect(messageCounts([])).toEqual(new Map());
  });

  it("explains an empty feed: nothing in the session, or the first message is later", () => {
    expect(feedEmptyState(all, 44, 5000)).toEqual({ kind: "none" });
    expect(feedEmptyState([], "all", 0)).toEqual({ kind: "none" });
    expect(feedEmptyState(all, "all", 100)).toEqual({ kind: "before-first", total: 4, first: m(81, 300) });
    expect(feedEmptyState(all, 63, 400)).toEqual({ kind: "before-first", total: 2, first: m(63, 500) });
    expect(feedEmptyState(all, "all", 300)).toBeNull();
  });
});
