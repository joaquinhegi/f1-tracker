import { describe, expect, it } from "vitest";
import { isLiveChunkSettled, liveChunks, replayChunks } from "./chunk-plan";

const START = Date.parse("2026-10-02T04:30:00Z");
const END = Date.parse("2026-10-02T05:30:00Z");
const MIN = 60_000;

describe("replayChunks", () => {
  it("loads the current chunk first, then ahead, then behind", () => {
    const plan = replayChunks({ playhead: START + 5.5 * MIN, rate: 1, sessionStart: START, sessionEnd: END });
    expect(plan).toEqual([START + 5 * MIN, START + 6 * MIN, START + 4 * MIN]);
  });

  it("looks further ahead at higher speeds", () => {
    const plan = replayChunks({ playhead: START + 10 * MIN, rate: 16, sessionStart: START, sessionEnd: END });
    expect(plan).toHaveLength(1 + 6 + 1); // 16 x 20 s = 320 s ahead -> 6 chunks
  });

  it("stays inside the session", () => {
    expect(replayChunks({ playhead: START - MIN, rate: 1, sessionStart: START, sessionEnd: END })).toEqual([
      START,
      START + MIN,
    ]);
    expect(replayChunks({ playhead: END + 5 * MIN, rate: 1, sessionStart: START, sessionEnd: END })).toEqual([
      END,
      END - MIN,
    ]);
  });
});

describe("liveChunks", () => {
  it("covers the delayed playhead up to now", () => {
    const now = START + 25_000;
    expect(liveChunks(now - 4_000, now)).toEqual([START + 10_000, START + 20_000]);
  });

  it("settles a chunk 15 s after it ends", () => {
    expect(isLiveChunkSettled(START, START + 24_999)).toBe(false);
    expect(isLiveChunkSettled(START, START + 25_000)).toBe(true);
  });
});
