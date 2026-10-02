import { describe, expect, it } from "vitest";
import { chunkStart, parseTimeWindow } from "./time-window";

describe("chunkStart", () => {
  it("floors to the chunk boundary", () => {
    expect(chunkStart(Date.parse("2026-10-02T04:31:59.999Z"), 60_000)).toBe(Date.parse("2026-10-02T04:31:00Z"));
  });
});

describe("parseTimeWindow", () => {
  it("accepts an aligned window up to 120 s", () => {
    const result = parseTimeWindow("2026-10-02T04:31:00Z", "2026-10-02T04:33:00Z");
    expect(result).toEqual({
      ok: true,
      window: { from: new Date("2026-10-02T04:31:00Z"), to: new Date("2026-10-02T04:33:00Z") },
    });
  });

  it.each([
    [null, "2026-10-02T04:31:00Z"],
    ["nope", "2026-10-02T04:31:00Z"],
    ["2026-10-02T04:31:01Z", "2026-10-02T04:32:00Z"], // not aligned
    ["2026-10-02T04:31:00Z", "2026-10-02T04:31:00Z"], // empty
    ["2026-10-02T04:31:00Z", "2026-10-02T04:33:05Z"], // too long
  ])("rejects %s .. %s", (from, to) => {
    expect(parseTimeWindow(from, to).ok).toBe(false);
  });
});
