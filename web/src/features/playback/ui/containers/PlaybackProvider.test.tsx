import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlaybackProvider, usePlayback, usePlayhead, type PlaybackSession } from "./PlaybackProvider";

const session: PlaybackSession = {
  key: 1, name: "Practice 1", type: "Practice",
  start: "2026-01-01T10:00:00Z", end: "2026-01-01T11:00:00Z", status: "finished",
};

function Probe() {
  const { seek, sessionStart } = usePlayback();
  const playhead = usePlayhead(1000);
  return (
    <>
      <output>{playhead === null ? "none" : (playhead - sessionStart) / 1000}</output>
      <button onClick={() => seek(sessionStart + 800_000)}>seek</button>
    </>
  );
}

describe("PlaybackProvider", () => {
  it("seeks a replay", async () => {
    render(
      <PlaybackProvider session={session} initialOffsetSeconds={60}>
        <Probe />
      </PlaybackProvider>,
    );
    expect(screen.getByRole("status").textContent).toBe("60");
    await act(async () => screen.getByRole("button").click());
    expect(screen.getByRole("status").textContent).toBe("800");
  });
});
