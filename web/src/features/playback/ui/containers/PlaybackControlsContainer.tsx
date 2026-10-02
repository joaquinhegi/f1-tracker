"use client";

import { formatClockTime } from "@/shared/ui/format/date-time";
import { formatElapsed, PLAYBACK_RATES } from "../../domain/playback-clock";
import { LiveIndicator, ReplayControls } from "../components/PlaybackControls";
import { usePlayback, usePlayhead } from "./PlaybackProvider";

/** Binds the transport controls to the session's playback clock. */
export function PlaybackControlsContainer() {
  const { state, sessionStart, sessionEnd, play, pause, seek, setRate } = usePlayback();
  const playhead = usePlayhead(250);
  if (!state) return null;
  if (state.mode === "live") return <LiveIndicator delaySeconds={Math.round(state.liveDelayMs / 1000)} />;

  const t = playhead ?? state.anchorSession;
  const durationMs = sessionEnd - sessionStart;
  return (
    <ReplayControls
      playing={state.playing}
      rate={state.rate}
      rates={PLAYBACK_RATES}
      elapsedMs={t - sessionStart}
      durationMs={durationMs}
      elapsedLabel={formatElapsed(t - sessionStart)}
      durationLabel={formatElapsed(durationMs)}
      // Before mount, UTC keeps server and client markup identical.
      clockLabel={playhead === null ? "" : formatClockTime()(new Date(t))}
      onPlay={play}
      onPause={pause}
      onRate={setRate}
      onSeek={(elapsed) => seek(sessionStart + elapsed)}
    />
  );
}
