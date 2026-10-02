import { describe, expect, it } from "vitest";
import { boxSlots } from "./box-slots";

describe("boxSlots", () => {
  const drivers = [
    { number: 81, teamName: "McLaren" }, { number: 63, teamName: "Mercedes" }, { number: 1, teamName: "McLaren" },
    { number: 12, teamName: "Mercedes" }, { number: 3, teamName: "Red Bull Racing" }, { number: 99, teamName: null },
  ];

  it("groups teammates and orders teams by their lowest car number", () => {
    const { fractions } = boxSlots(drivers);
    const order = [...fractions.entries()].sort((a, b) => a[1] - b[1]).map(([n]) => n);
    expect(order).toEqual([1, 81, 3, 12, 63, 99]);
  });

  it("keeps every box inside the stretch with a gap between teams", () => {
    const { fractions, spacing } = boxSlots(drivers);
    for (const f of fractions.values()) {
      expect(f).toBeGreaterThan(0);
      expect(f).toBeLessThan(1);
    }
    const f = (n: number) => fractions.get(n)!;
    expect(f(81) - f(1)).toBeCloseTo(spacing); // teammates side by side
    expect(f(3) - f(81)).toBeCloseTo(spacing * 1.25); // next team after a gap
  });

  it("is stable whatever the input order", () => {
    expect(boxSlots([...drivers].reverse()).fractions).toEqual(boxSlots(drivers).fractions);
    expect(boxSlots([]).fractions.size).toBe(0);
  });
});
