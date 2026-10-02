import { describe, expect, it } from "vitest";
import { meetingSpan, selectMeeting, startOfLocalDay } from "./select-meeting";
import type { Meeting, WeekendSession } from "./weekend";

const at = (iso: string) => new Date(iso);

function meeting(key: number, start: string, end: string, utcOffsetMinutes = 0, isCancelled = false): Meeting {
  return {
    key,
    name: `GP ${key}`,
    officialName: "",
    countryName: "",
    countryCode: "",
    countryFlagUrl: null,
    location: "",
    circuitKey: key,
    circuitName: "",
    utcOffsetMinutes,
    start: at(start),
    end: at(end),
    isCancelled,
  };
}

function session(meetingKey: number, key: number, start: string, end: string): WeekendSession {
  return { key, meetingKey, name: "Race", type: "Race", kind: "race", start: at(start), end: at(end), isCancelled: false };
}

// Malaysia-style weekend, UTC+8: FP1 Fri 12:30 local, race Sun 15:00-17:00 local.
const KL = meeting(1308, "2026-10-02T04:30:00Z", "2026-10-04T09:00:00Z", 480);
const KL_RACE = session(1308, 11731, "2026-10-04T07:00:00Z", "2026-10-04T09:00:00Z");
// Singapore, the week after.
const SG = meeting(1296, "2026-10-09T08:30:00Z", "2026-10-11T14:00:00Z", 480);
// Las Vegas, UTC-8: sessions are on Thursday/Friday/Saturday local evening = next UTC day.
const LV = meeting(1300, "2026-11-20T00:30:00Z", "2026-11-22T06:00:00Z", -480);

describe("startOfLocalDay", () => {
  it("uses the circuit's offset, not UTC", () => {
    // 2026-10-02T04:30Z is 12:30 in UTC+8 -> local midnight is 2026-10-01T16:00Z
    expect(startOfLocalDay(at("2026-10-02T04:30:00Z"), 480)).toEqual(at("2026-10-01T16:00:00Z"));
    // 2026-11-20T00:30Z is Thu 19 Nov 16:30 in UTC-8 -> local midnight 2026-11-19T08:00Z
    expect(startOfLocalDay(at("2026-11-20T00:30:00Z"), -480)).toEqual(at("2026-11-19T08:00:00Z"));
  });
});

describe("meetingSpan", () => {
  it("covers whole local days, extended by the meeting's sessions", () => {
    const late = session(1308, 1, "2026-10-04T14:00:00Z", "2026-10-04T16:30:00Z"); // ends 00:30 Mon local
    expect(meetingSpan(KL, [late])).toEqual({ from: at("2026-10-01T16:00:00Z"), to: at("2026-10-05T16:00:00Z") });
  });

  it("ignores sessions of other meetings", () => {
    const other = session(9, 1, "2026-12-01T00:00:00Z", "2026-12-01T01:00:00Z");
    expect(meetingSpan(KL, [other]).to).toEqual(at("2026-10-04T16:00:00Z"));
  });
});

describe("selectMeeting", () => {
  const meetings = [SG, KL, LV];

  it("picks the meeting happening now", () => {
    expect(selectMeeting(meetings, [KL_RACE], at("2026-10-03T10:00:00Z"))).toEqual({ meeting: KL, phase: "current" });
  });

  it("keeps the weekend current for the rest of race day (local time)", () => {
    // Race ended 09:00Z = 17:00 local; at 23:59 local (15:59Z) it's still race day.
    expect(selectMeeting(meetings, [KL_RACE], at("2026-10-04T15:59:00Z"))?.meeting.key).toBe(1308);
    // Local midnight (16:00Z) -> next meeting.
    expect(selectMeeting(meetings, [KL_RACE], at("2026-10-04T16:00:00Z"))).toEqual({ meeting: SG, phase: "upcoming" });
  });

  it("is current from local midnight of the first session day", () => {
    expect(selectMeeting(meetings, [], at("2026-10-01T15:59:59Z"))?.phase).toBe("upcoming");
    expect(selectMeeting(meetings, [], at("2026-10-01T16:00:00Z"))?.phase).toBe("current");
  });

  it("handles negative offsets (Las Vegas Thursday evening is Friday UTC)", () => {
    // Thu 19 Nov 08:00Z is local midnight of Thursday in UTC-8.
    expect(selectMeeting(meetings, [], at("2026-11-19T08:00:00Z"))).toEqual({ meeting: LV, phase: "current" });
    expect(selectMeeting(meetings, [], at("2026-11-19T07:59:00Z"))?.phase).toBe("upcoming");
  });

  it("returns the next upcoming meeting between weekends", () => {
    expect(selectMeeting(meetings, [], at("2026-10-07T00:00:00Z"))).toEqual({ meeting: SG, phase: "upcoming" });
  });

  it("falls back to the last finished meeting after the season", () => {
    expect(selectMeeting(meetings, [], at("2026-12-25T00:00:00Z"))).toEqual({ meeting: LV, phase: "finished" });
  });

  it("skips cancelled meetings", () => {
    const cancelled = meeting(1, "2026-10-02T00:00:00Z", "2026-10-04T00:00:00Z", 0, true);
    expect(selectMeeting([cancelled, SG], [], at("2026-10-03T00:00:00Z"))?.meeting.key).toBe(1296);
  });

  it("returns null without meetings", () => {
    expect(selectMeeting([], [], at("2026-10-03T00:00:00Z"))).toBeNull();
  });
});
