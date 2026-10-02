import { describe, expect, it } from "vitest";
import { isInRecordingWindow, recordingWindow } from "./live-window";

const at = (iso: string) => new Date(iso);
const race = { sessionName: "Race", sessionType: "Race", start: at("2026-10-04T07:00:00Z"), end: at("2026-10-04T09:00:00Z") };
const fp1 = { sessionName: "Practice 1", sessionType: "Practice", start: at("2026-10-02T04:30:00Z"), end: at("2026-10-02T05:30:00Z") };

describe("recording window", () => {
  it("matches the scheduler: race-like 60/60 min, others 15/30 min", () => {
    expect(recordingWindow(race)).toEqual({ from: at("2026-10-04T06:00:00Z"), to: at("2026-10-04T10:00:00Z") });
    expect(recordingWindow(fp1)).toEqual({ from: at("2026-10-02T04:15:00Z"), to: at("2026-10-02T06:00:00Z") });
    expect(recordingWindow({ ...fp1, sessionName: "Sprint", sessionType: "Race" }).from).toEqual(at("2026-10-02T03:30:00Z"));
  });

  it("is half-open and ignores cancelled sessions", () => {
    expect(isInRecordingWindow(fp1, at("2026-10-02T04:15:00Z"))).toBe(true);
    expect(isInRecordingWindow(fp1, at("2026-10-02T06:00:00Z"))).toBe(false);
    expect(isInRecordingWindow({ ...fp1, isCancelled: true }, at("2026-10-02T05:00:00Z"))).toBe(false);
  });
});
