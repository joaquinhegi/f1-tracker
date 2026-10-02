import { describe, expect, it } from "vitest";
import { defaultSelection, FALLBACK_TEAM_COLOUR, normalizeTeamColour, toggleDriver } from "./driver";

describe("normalizeTeamColour", () => {
  it("adds the hash and upper-cases", () => {
    expect(normalizeTeamColour("f47600")).toBe("#F47600");
    expect(normalizeTeamColour("#3671C6")).toBe("#3671C6");
  });

  it.each([null, undefined, "", "red", "12345"])("falls back for %s", (raw) => {
    expect(normalizeTeamColour(raw)).toBe(FALLBACK_TEAM_COLOUR);
  });
});

describe("selection", () => {
  it("defaults to the top three of the order", () => {
    expect(defaultSelection([4, 81, 1, 63])).toEqual([4, 81, 1]);
    expect(defaultSelection([4])).toEqual([4]);
  });

  it("toggles drivers in and out", () => {
    expect(toggleDriver([1, 4], 81)).toEqual([1, 4, 81]);
    expect(toggleDriver([1, 4, 81], 4)).toEqual([1, 81]);
  });
});
