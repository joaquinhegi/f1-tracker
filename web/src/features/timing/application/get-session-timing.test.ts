import { describe, expect, it } from "vitest";
import { FakeProvider } from "@/shared/testing/fake-provider";
import { getIntervalWindow, getSessionTiming } from "./get-session-timing";
import { intervalsFromDto, timingFromDto } from "./timing-dto";

const provider = new FakeProvider({
  laps: [
    {
      session_key: 7, meeting_key: 1, driver_number: 1, lap_number: 3, date_start: "2026-09-26T11:05:00+00:00",
      duration_sector_1: 30.1, duration_sector_2: null, duration_sector_3: null, lap_duration: null, is_pit_out_lap: true,
    },
  ],
  stints: [{ session_key: 7, meeting_key: 1, driver_number: 1, stint_number: 1, lap_start: 1, lap_end: 10, compound: "SOFT", tyre_age_at_start: 3 }],
  positions: [{ session_key: 7, meeting_key: 1, driver_number: 1, date: "2026-09-26T11:00:00+00:00", position: 2 }],
  pits: [{ session_key: 7, meeting_key: 1, driver_number: 1, date: "2026-09-26T11:20:00+00:00", lap_number: 9, pit_duration: 22.1 }],
  intervals: [
    { session_key: 7, meeting_key: 1, driver_number: 1, date: "2026-09-26T11:30:01+00:00", gap_to_leader: "+1 LAP", interval: 0.4 },
    { session_key: 7, meeting_key: 1, driver_number: 1, date: "2026-09-26T11:35:00+00:00", gap_to_leader: 1, interval: 1 },
  ],
});

describe("getSessionTiming", () => {
  it("maps the four collections and round-trips to the domain", async () => {
    const dto = await getSessionTiming(provider, 7);
    expect(dto.laps[0]).toEqual({
      driverNumber: 1, lapNumber: 3, start: "2026-09-26T11:05:00+00:00", sectors: [30.1, null, null], duration: null, isPitOutLap: true,
    });
    const timing = timingFromDto(dto);
    expect(timing.laps[0].start).toBe(Date.parse("2026-09-26T11:05:00Z"));
    expect(timing.pits).toEqual([{ driverNumber: 1, lapNumber: 9, date: Date.parse("2026-09-26T11:20:00Z") }]);
    expect(timing.stints[0]).toMatchObject({ compound: "SOFT", tyreAgeAtStart: 3 });
  });
});

describe("getIntervalWindow", () => {
  it("parses gaps and keeps only the window", async () => {
    const dto = await getIntervalWindow(provider, 7, {
      from: new Date("2026-09-26T11:30:00Z"),
      to: new Date("2026-09-26T11:32:00Z"),
    });
    expect(dto.intervals).toEqual([
      { driverNumber: 1, date: "2026-09-26T11:30:01+00:00", gapToLeader: { kind: "laps", laps: 1 }, interval: { kind: "time", seconds: 0.4 } },
    ]);
    expect(intervalsFromDto(dto)[0].date).toBe(Date.parse("2026-09-26T11:30:01Z"));
  });
});
