/**
 * The playback clock: the one source of "session time" every feature reads
 * (car positions, timing board, team radio). Pure: every function takes the
 * wall-clock time explicitly.
 *
 * - live: session time = wall time - a fixed delay. The delay gives the data
 *   pipeline (recorder -> MongoDB -> API -> BFF -> browser poll) time to
 *   deliver the samples on both sides of the instant being drawn, so cars are
 *   interpolated instead of jumping to the newest sample.
 * - replay: session time advances from an anchor at `rate` x real time while
 *   playing, and stops at the session end.
 */

export type PlaybackMode = "live" | "replay";

export const LIVE_DELAY_MS = 4_000;
export const PLAYBACK_RATES = [1, 2, 4, 8, 16] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export interface PlaybackState {
  mode: PlaybackMode;
  /** Session bounds, epoch ms. */
  start: number;
  end: number;
  playing: boolean;
  rate: PlaybackRate;
  /** Session time at `anchorWall` (replay). */
  anchorSession: number;
  anchorWall: number;
  liveDelayMs: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export function createLiveState(start: number, end: number, wallNow: number, liveDelayMs = LIVE_DELAY_MS): PlaybackState {
  return { mode: "live", start, end, playing: true, rate: 1, anchorSession: wallNow - liveDelayMs, anchorWall: wallNow, liveDelayMs };
}

/** Replays start paused at `initial` (default: the session start). */
export function createReplayState(start: number, end: number, wallNow: number, initial = start): PlaybackState {
  return {
    mode: "replay",
    start,
    end,
    playing: false,
    rate: 1,
    anchorSession: clamp(initial, start, end),
    anchorWall: wallNow,
    liveDelayMs: LIVE_DELAY_MS,
  };
}

export function playheadAt(state: PlaybackState, wallNow: number): number {
  if (state.mode === "live") return wallNow - state.liveDelayMs;
  if (!state.playing) return state.anchorSession;
  return clamp(state.anchorSession + (wallNow - state.anchorWall) * state.rate, state.start, state.end);
}

export function isAtEnd(state: PlaybackState, wallNow: number): boolean {
  return state.mode === "replay" && playheadAt(state, wallNow) >= state.end;
}

/** Re-anchors at the current playhead so a change never makes time jump. */
function reanchor(state: PlaybackState, wallNow: number): PlaybackState {
  return { ...state, anchorSession: playheadAt(state, wallNow), anchorWall: wallNow };
}

export function play(state: PlaybackState, wallNow: number): PlaybackState {
  if (state.mode === "live") return state;
  const anchored = reanchor(state, wallNow);
  // Pressing play at the end restarts the replay.
  const from = anchored.anchorSession >= state.end ? state.start : anchored.anchorSession;
  return { ...anchored, anchorSession: from, playing: true };
}

export function pause(state: PlaybackState, wallNow: number): PlaybackState {
  if (state.mode === "live") return state;
  return { ...reanchor(state, wallNow), playing: false };
}

export function seek(state: PlaybackState, wallNow: number, sessionTime: number): PlaybackState {
  if (state.mode === "live") return state;
  return { ...state, anchorSession: clamp(sessionTime, state.start, state.end), anchorWall: wallNow };
}

export function setRate(state: PlaybackState, wallNow: number, rate: PlaybackRate): PlaybackState {
  if (state.mode === "live") return state;
  return { ...reanchor(state, wallNow), rate };
}

/** "1:02:03" / "12:03" elapsed since the session start. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`;
}
