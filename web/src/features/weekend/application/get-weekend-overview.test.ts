import { describe, expect, it } from "vitest";
import { FakeProvider, meeting, session } from "@/shared/testing/fake-provider";
import { getWeekendOverview, NoMeetingFoundError } from "./get-weekend-overview";

const clockAt = (iso: string) => () => new Date(iso);

const KL = meeting({ meeting_key: 1308, gmt_offset: "08:00:00" });
const ABU = meeting({
  meeting_key: 1302,
  date_start: "2026-12-04T09:30:00+00:00",
  date_end: "2026-12-06T15:00:00+00:00",
  gmt_offset: "04:00:00",
});
const AUS_2027 = meeting({
  meeting_key: 2001,
  year: 2027,
  date_start: "2027-03-05T01:30:00+00:00",
  date_end: "2027-03-07T06:00:00+00:00",
  gmt_offset: "11:00:00",
});
const sessions = [
  session({ session_key: 11731, session_name: "Race", session_type: "Race", date_start: "2026-10-04T07:00:00+00:00", date_end: "2026-10-04T09:00:00+00:00", meeting_key: 1308 }),
  session({ session_key: 11727, meeting_key: 1308 }),
  session({ session_key: 11728, session_name: "Practice 2", date_start: "2026-10-02T08:00:00+00:00", date_end: "2026-10-02T09:00:00+00:00", meeting_key: 1308 }),
];

describe("getWeekendOverview", () => {
  it("returns the current meeting with sorted sessions, statuses and default selection", async () => {
    const provider = new FakeProvider({ meetings: [KL, ABU], sessions });
    const overview = await getWeekendOverview(provider, clockAt("2026-10-02T08:30:00Z"));

    expect(overview.phase).toBe("current");
    expect(overview.meeting).toMatchObject({ key: 1308, utcOffsetMinutes: 480, start: "2026-10-02T04:30:00.000Z" });
    expect(overview.sessions.map((s) => [s.key, s.shortLabel, s.status])).toEqual([
      [11727, "FP1", "finished"],
      [11728, "FP2", "live"],
      [11731, "Race", "upcoming"],
    ]);
    expect(overview.selectedSessionKey).toBe(11728);
  });

  it("rolls over to next season after the last race", async () => {
    const provider = new FakeProvider({ meetings: [KL, ABU, AUS_2027], sessions });
    const overview = await getWeekendOverview(provider, clockAt("2026-12-20T00:00:00Z"));
    expect(overview).toMatchObject({ phase: "upcoming", meeting: { key: 2001 } });
  });

  it("keeps the last finished weekend if next season is unknown", async () => {
    const provider = new FakeProvider({ meetings: [KL, ABU], sessions });
    const overview = await getWeekendOverview(provider, clockAt("2026-12-20T00:00:00Z"));
    expect(overview).toMatchObject({ phase: "finished", meeting: { key: 1302 }, sessions: [] });
  });

  it("throws when there is no calendar at all", async () => {
    await expect(getWeekendOverview(new FakeProvider(), clockAt("2026-10-02T00:00:00Z"))).rejects.toBeInstanceOf(
      NoMeetingFoundError,
    );
  });
});
