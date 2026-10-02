import { describe, expect, it } from "vitest";
import { formatDay, formatTime, timeZoneLabel } from "./date-time";

describe("viewer-timezone formatting", () => {
  const vegasFp1 = new Date("2026-11-20T00:30:00Z");

  it("shows the session in the viewer's zone, including the local day", () => {
    expect(formatTime({ timeZone: "America/Los_Angeles" })(vegasFp1)).toBe("16:30");
    expect(formatDay({ timeZone: "America/Los_Angeles" })(vegasFp1)).toBe("Thu 19 Nov");
    expect(formatDay({ timeZone: "Asia/Tokyo" })(vegasFp1)).toBe("Fri 20 Nov");
  });

  it("follows DST transitions (Madrid: CEST before 25 Oct 2026, CET after)", () => {
    const zone = { timeZone: "Europe/Madrid" };
    expect(formatTime(zone)(new Date("2026-10-24T12:00:00Z"))).toBe("14:00");
    expect(formatTime(zone)(new Date("2026-10-26T12:00:00Z"))).toBe("13:00");
    expect(timeZoneLabel(new Date("2026-10-26T12:00:00Z"), zone)).toBe("CET");
  });
});
