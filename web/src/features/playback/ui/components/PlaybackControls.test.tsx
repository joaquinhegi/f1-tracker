import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PLAYBACK_RATES } from "../../domain/playback-clock";
import { ReplayControls } from "./PlaybackControls";

describe("ReplayControls", () => {
  it("plays, changes speed and seeks", async () => {
    const handlers = { onPlay: vi.fn(), onPause: vi.fn(), onRate: vi.fn(), onSeek: vi.fn() };
    render(
      <ReplayControls
        playing={false} rate={1} rates={PLAYBACK_RATES} elapsedMs={60_000} durationMs={3_600_000}
        elapsedLabel="1:00" durationLabel="1:00:00" clockLabel="06:31:00" {...handlers}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Play replay" }));
    expect(handlers.onPlay).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "1x" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "16x" }));
    expect(handlers.onRate).toHaveBeenCalledWith(16);
    const slider = screen.getByRole("slider", { name: "Session time" });
    expect(slider).toHaveAttribute("aria-valuetext", "1:00 of 1:00:00");
    fireEvent.change(slider, { target: { value: "120000" } });
    expect(handlers.onSeek).toHaveBeenCalledWith(120_000);
  });
});
