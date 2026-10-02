import { describe, expect, it } from "vitest";
import { feedEmptyCopy } from "./feed-empty-copy";

const when = (date: number) => `T${date}`;
const first = { driverNumber: 81, date: 300, recordingUrl: "u", lapNumber: 4 };

describe("feedEmptyCopy", () => {
  it("says when the session has no radio at all", () => {
    expect(feedEmptyCopy({ kind: "none" }, { who: null, live: false, when })).toEqual({
      title: "No team radio in this session",
      message: "OpenF1 published no recordings for it.",
    });
    expect(feedEmptyCopy({ kind: "none" }, { who: "NOR", live: false, when }).title).toBe("No team radio from NOR in this session");
    expect(feedEmptyCopy({ kind: "none" }, { who: null, live: true, when }).title).toBe("No team radio yet");
  });

  it("points to the first message and offers the jump when the replay is before it", () => {
    expect(feedEmptyCopy({ kind: "before-first", total: 7, first }, { who: null, live: false, when })).toEqual({
      title: "7 messages in this session",
      message: "The first one is at T300, lap 4. The replay has not reached it yet.",
      jumpTo: 300,
    });
    const one = feedEmptyCopy({ kind: "before-first", total: 1, first: { ...first, lapNumber: null } }, { who: "PIA", live: false, when });
    expect(one.title).toBe("1 message from PIA in this session");
    expect(one.message).toBe("The first one is at T300. The replay has not reached it yet.");
  });
});
