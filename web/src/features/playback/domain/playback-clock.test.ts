import { describe, expect, it } from "vitest";
import {
  createLiveState,
  createReplayState,
  formatElapsed,
  isAtEnd,
  pause,
  play,
  playheadAt,
  seek,
  setRate,
} from "./playback-clock";

const START = 1_000_000;
const END = START + 3_600_000;

describe("live", () => {
  it("runs a fixed delay behind the wall clock and ignores controls", () => {
    const state = createLiveState(START, END, START + 60_000, 4_000);
    expect(playheadAt(state, START + 70_000)).toBe(START + 66_000);
    expect(pause(state, START + 70_000)).toBe(state);
    expect(seek(state, START + 70_000, START)).toBe(state);
  });
});

describe("replay", () => {
  it("starts paused at the session start (or a given instant)", () => {
    expect(playheadAt(createReplayState(START, END, 0), 99_999)).toBe(START);
    expect(playheadAt(createReplayState(START, END, 0, START + 5_000), 1)).toBe(START + 5_000);
    expect(playheadAt(createReplayState(START, END, 0, END + 5_000), 1)).toBe(END);
  });

  it("advances at the chosen rate and never jumps on changes", () => {
    let state = play(createReplayState(START, END, 0), 0);
    expect(playheadAt(state, 1_000)).toBe(START + 1_000);
    state = setRate(state, 1_000, 8);
    expect(playheadAt(state, 1_000)).toBe(START + 1_000);
    expect(playheadAt(state, 2_000)).toBe(START + 9_000);
    state = pause(state, 2_000);
    expect(playheadAt(state, 60_000)).toBe(START + 9_000);
  });

  it("seeks and clamps to the session", () => {
    const state = seek(play(createReplayState(START, END, 0), 0), 500, START + 120_000);
    expect(playheadAt(state, 1_500)).toBe(START + 121_000);
    expect(playheadAt(seek(state, 0, START - 1), 0)).toBe(START);
  });

  it("stops at the end, and play restarts from the beginning", () => {
    const running = play(createReplayState(START, END, 0, END - 1_000), 0);
    expect(playheadAt(running, 10_000)).toBe(END);
    expect(isAtEnd(running, 10_000)).toBe(true);
    const restarted = play(running, 10_000);
    expect(playheadAt(restarted, 10_000)).toBe(START);
  });
});

describe("formatElapsed", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(75_000)).toBe("1:15");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});
