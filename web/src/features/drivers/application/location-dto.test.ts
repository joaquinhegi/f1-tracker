import { describe, expect, it } from "vitest";
import type { OpenF1Location } from "@/shared/f1-data/f1-data-provider";
import { FakeProvider } from "@/shared/testing/fake-provider";
import { getLocationWindow } from "./get-location-window";
import { locationsToDto, samplesFromDto } from "./location-dto";

const FROM = new Date("2026-10-02T04:31:00Z");
const TO = new Date("2026-10-02T04:32:00Z");

function row(driver: number, iso: string, x: number, y: number): OpenF1Location {
  return { session_key: 1, meeting_key: 1, driver_number: driver, date: iso, x, y, z: 0 };
}

describe("locationsToDto", () => {
  it("groups by driver, sorts by time, drops unplaced (0, 0) samples", () => {
    const dto = locationsToDto(1, FROM, TO, [
      row(4, "2026-10-02T04:31:00.540Z", 20, 21),
      row(4, "2026-10-02T04:31:00.270Z", 10, 11),
      row(1, "2026-10-02T04:31:00.100Z", 0, 0),
      row(1, "2026-10-02T04:31:01.000+00:00", -5, 7),
    ]);
    expect(dto).toEqual({
      sessionKey: 1,
      from: "2026-10-02T04:31:00.000Z",
      to: "2026-10-02T04:32:00.000Z",
      drivers: { "1": [1000, -5, 7], "4": [270, 10, 11, 540, 20, 21] },
    });
  });

  it("round-trips into absolute samples", () => {
    const dto = locationsToDto(1, FROM, TO, [row(4, "2026-10-02T04:31:00.270Z", 10, 11)]);
    expect(samplesFromDto(dto).get(4)).toEqual([{ t: FROM.getTime() + 270, x: 10, y: 11 }]);
  });
});

describe("getLocationWindow", () => {
  it("asks for every driver in one call", async () => {
    const provider = new FakeProvider({
      locations: [row(4, "2026-10-02T04:31:10Z", 1, 2), row(81, "2026-10-02T04:31:20Z", 3, 4), row(81, "2026-10-02T04:33:00Z", 5, 6)],
    });
    const dto = await getLocationWindow(provider, 1, { from: FROM, to: TO });
    expect(Object.keys(dto.drivers)).toEqual(["4", "81"]);
    expect(provider.calls).toEqual(["location 1 #all"]);
  });
});
