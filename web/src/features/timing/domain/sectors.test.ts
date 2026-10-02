import { describe, expect, it } from "vitest";
import { bestLapGaps, raceGaps } from "./gaps";
import { markTime, minOrNull } from "./sectors";

describe("markTime", () => {
  it("prefers overall best, then personal best", () => {
    expect(markTime(28.1, 28.1, 28.1)).toBe("overall-best");
    expect(markTime(28.3, 28.3, 28.1)).toBe("personal-best");
    expect(markTime(28.5, 28.3, 28.1)).toBe("normal");
    expect(markTime(null, 28.3, 28.1)).toBe("normal");
  });

  it("minOrNull skips nulls", () => {
    expect(minOrNull([null, 3, 1, null])).toBe(1);
    expect(minOrNull([null])).toBeNull();
  });
});

describe("gaps", () => {
  it("race: own interval is the gap ahead, the next car's is the gap behind", () => {
    const pairs = raceGaps([null, { kind: "time", seconds: 1.2 }, { kind: "laps", laps: 1 }]);
    expect(pairs).toEqual([
      { ahead: null, behind: { kind: "time", seconds: 1.2 } },
      { ahead: { kind: "time", seconds: 1.2 }, behind: { kind: "laps", laps: 1 } },
      { ahead: { kind: "laps", laps: 1 }, behind: null },
    ]);
  });

  it("practice: best-lap deltas to the neighbours", () => {
    const pairs = bestLapGaps([90, 90.5, null, 91]);
    expect(pairs[0]).toEqual({ ahead: null, behind: { kind: "time", seconds: 0.5 } });
    expect(pairs[1].ahead).toEqual({ kind: "time", seconds: 0.5 });
    expect(pairs[1].behind).toBeNull();
    expect(pairs[3]).toEqual({ ahead: null, behind: null });
  });
});
