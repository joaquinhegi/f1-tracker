import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeekendOverviewDto } from "../../application/weekend-dto";
import { WeekendHeroContainer } from "./WeekendHeroContainer";

const overview: WeekendOverviewDto = {
  generatedAt: "2026-10-02T08:30:00.000Z",
  phase: "current",
  meeting: {
    key: 1308, name: "Bahrain Grand Prix", officialName: "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX IN MALAYSIA 2026",
    countryName: "Bahrain", countryCode: "BRN", countryFlagUrl: null, location: "Kuala Lumpur", circuitKey: 12,
    circuitName: "Kuala Lumpur", utcOffsetMinutes: 480, start: "2026-10-02T04:30:00.000Z", end: "2026-10-04T09:00:00.000Z",
  },
  sessions: [
    { key: 1, meetingKey: 1308, name: "Practice 1", shortLabel: "FP1", type: "Practice", kind: "practice-1",
      start: "2026-10-02T04:30:00.000Z", end: "2026-10-02T05:30:00.000Z", isCancelled: false, status: "finished" },
    { key: 2, meetingKey: 1308, name: "Practice 2", shortLabel: "FP2", type: "Practice", kind: "practice-2",
      start: "2026-10-02T08:00:00.000Z", end: "2026-10-02T09:00:00.000Z", isCancelled: false, status: "live" },
    { key: 3, meetingKey: 1308, name: "Race", shortLabel: "Race", type: "Race", kind: "race",
      start: "2026-10-04T07:00:00.000Z", end: "2026-10-04T09:00:00.000Z", isCancelled: false, status: "upcoming" },
  ],
  selectedSessionKey: 3,
};

describe("WeekendHeroContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(new Date("2026-10-04T06:59:57.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the GP and ticks the countdown client-side until the session goes live", () => {
    render(<WeekendHeroContainer overview={overview} />);

    expect(screen.getByRole("heading", { level: 1, name: "Bahrain Grand Prix" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent(/00hrs00min03sec/);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("timer")).toHaveTextContent(/00min02sec/);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByRole("timer")).not.toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveTextContent(/Live/);
  });

  it("lets the viewer pick a finished session for replay", async () => {
    vi.useRealTimers();
    const { default: userEvent } = await import("@testing-library/user-event");
    const onSessionChange = vi.fn();
    render(<WeekendHeroContainer overview={overview} onSessionChange={onSessionChange} />);

    await userEvent.click(screen.getByRole("tab", { name: /FP1/ }));

    expect(onSessionChange).toHaveBeenCalledWith(1);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Practice 1");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Replay");
  });
});
