import { describe, expect, it } from "vitest";
import { driver, FakeProvider } from "@/shared/testing/fake-provider";
import { getSessionDrivers } from "./get-session-drivers";

describe("getSessionDrivers", () => {
  it("maps OpenF1 drivers, dedupes by number and sorts", async () => {
    const provider = new FakeProvider({
      drivers: [
        driver(9, 81, { name_acronym: "PIA", full_name: "Oscar PIASTRI", team_colour: "f47600" }),
        driver(9, 4, { team_colour: null, headshot_url: "" }),
        driver(9, 81, { name_acronym: "PIA", full_name: "Oscar PIASTRI", team_colour: "F47600", headshot_url: "https://x/p.png" }),
      ],
    });
    const dto = await getSessionDrivers(provider, 9);
    expect(dto.drivers.map((d) => [d.number, d.acronym, d.teamColour, d.headshotUrl])).toEqual([
      [4, "NOR", "#8B949E", null],
      [81, "PIA", "#F47600", "https://x/p.png"],
    ]);
  });
});
