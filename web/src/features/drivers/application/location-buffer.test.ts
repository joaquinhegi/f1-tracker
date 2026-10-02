import { describe, expect, it } from "vitest";
import { LocationBuffer } from "./location-buffer";

const s = (t: number, x: number) => ({ t, x, y: 0 });

describe("LocationBuffer", () => {
  it("merges windows and interpolates across their boundary", () => {
    const buffer = new LocationBuffer();
    buffer.insert(0, 1000, new Map([[4, [s(0, 0), s(900, 90)]]]));
    buffer.insert(1000, 2000, new Map([[4, [s(1100, 110)]]]));
    expect(buffer.positionAt(4, 1000)).toEqual({ x: 100, y: 0 });
    expect(buffer.positionAt(81, 1000)).toBeNull();
  });

  it("replaces a window that is fetched again (live refresh)", () => {
    const buffer = new LocationBuffer();
    buffer.insert(0, 1000, new Map([[4, [s(100, 10)]]]));
    buffer.insert(0, 1000, new Map([[4, [s(100, 10), s(500, 50)]]]));
    expect(buffer.sampleCount()).toBe(2);
    expect(buffer.positionAt(4, 300)).toEqual({ x: 30, y: 0 });
  });

  it("ignores samples outside the window it was told about", () => {
    const buffer = new LocationBuffer();
    buffer.insert(0, 1000, new Map([[4, [s(500, 50), s(1500, 150)]]]));
    expect(buffer.sampleCount()).toBe(1);
  });

  it("retains only the requested range", () => {
    const buffer = new LocationBuffer();
    buffer.insert(0, 3000, new Map([[4, [s(0, 0), s(1000, 1), s(2000, 2)]], [5, [s(0, 0)]]]));
    buffer.retain(900, 3000);
    expect(buffer.sampleCount()).toBe(2);
  });

  it("knows which time ranges were loaded, even without samples", () => {
    const buffer = new LocationBuffer();
    expect(buffer.covers(500)).toBe(false);
    buffer.insert(0, 1000, new Map());
    buffer.insert(1000, 2000, new Map([[4, [s(1500, 150)]]]));
    expect(buffer.covers(500)).toBe(true);
    expect(buffer.covers(1999)).toBe(true);
    expect(buffer.covers(2000)).toBe(false);
    expect(buffer.samplesOf(4)).toHaveLength(1);
    expect(buffer.samplesOf(81)).toEqual([]);
    buffer.retain(1200, 3000);
    expect(buffer.covers(500)).toBe(false);
    expect(buffer.covers(1300)).toBe(true);
  });
});
