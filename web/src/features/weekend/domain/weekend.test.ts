import { describe, expect, it } from "vitest";
import { parseUtcOffset, sessionKind, sessionShortLabel } from "./weekend";

describe("sessionKind", () => {
  it.each([
    ["Practice 1", "practice-1"],
    ["Practice 2", "practice-2"],
    ["Practice 3", "practice-3"],
    ["Sprint Qualifying", "sprint-qualifying"],
    ["Sprint Shootout", "sprint-qualifying"],
    ["Sprint", "sprint"],
    ["Qualifying", "qualifying"],
    [" race ", "race"],
    ["Day 1", "other"],
  ])("%s -> %s", (name, kind) => {
    expect(sessionKind(name)).toBe(kind);
  });

  it("labels tabs compactly, falling back to the name", () => {
    expect(sessionShortLabel({ kind: "sprint-qualifying", name: "Sprint Qualifying" })).toBe("SQ");
    expect(sessionShortLabel({ kind: "other", name: "Day 1" })).toBe("Day 1");
  });
});

describe("parseUtcOffset", () => {
  it.each([
    ["08:00:00", 480],
    ["-05:00:00", -300],
    ["05:30:00", 330],
    ["00:00:00", 0],
    ["garbage", 0],
    [null, 0],
  ])("%s -> %s", (raw, minutes) => {
    expect(parseUtcOffset(raw)).toBe(minutes);
  });
});
