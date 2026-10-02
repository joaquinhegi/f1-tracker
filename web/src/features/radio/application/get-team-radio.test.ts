import { describe, expect, it } from "vitest";
import { FakeProvider } from "@/shared/testing/fake-provider";
import { getTeamRadio } from "./get-team-radio";

const url = (name: string) => `https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix/2026-09-26_Race/TeamRadio/${name}.mp3`;

describe("getTeamRadio", () => {
  it("tags messages with the lap and drops foreign URLs", async () => {
    const provider = new FakeProvider({
      teamRadio: [
        { session_key: 5, meeting_key: 1, driver_number: 1, date: "2026-09-26T11:10:00+00:00", recording_url: url("NOR_1_b") },
        { session_key: 5, meeting_key: 1, driver_number: 1, date: "2026-09-26T11:01:00+00:00", recording_url: url("NOR_1_a") },
        { session_key: 5, meeting_key: 1, driver_number: 1, date: "2026-09-26T11:02:00+00:00", recording_url: "https://cdn.example/x.mp3" },
      ],
      laps: [
        { session_key: 5, meeting_key: 1, driver_number: 1, lap_number: 1, date_start: "2026-09-26T11:00:00+00:00",
          duration_sector_1: null, duration_sector_2: null, duration_sector_3: null, lap_duration: 100, is_pit_out_lap: false },
        { session_key: 5, meeting_key: 1, driver_number: 1, lap_number: 6, date_start: "2026-09-26T11:09:00+00:00",
          duration_sector_1: null, duration_sector_2: null, duration_sector_3: null, lap_duration: 100, is_pit_out_lap: false },
      ],
    });
    const dto = await getTeamRadio(provider, 5);
    expect(dto.messages).toEqual([
      { driverNumber: 1, date: "2026-09-26T11:01:00+00:00", recordingUrl: url("NOR_1_a"), lapNumber: 1 },
      { driverNumber: 1, date: "2026-09-26T11:10:00+00:00", recordingUrl: url("NOR_1_b"), lapNumber: 6 },
    ]);
  });
});
