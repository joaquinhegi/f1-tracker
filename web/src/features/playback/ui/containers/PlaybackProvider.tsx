"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isRaceLike } from "@/shared/f1-data/domain/live-window";
import { useNow } from "@/shared/ui/hooks/use-now";
import {
  createLiveState,
  createReplayState,
  pause as pauseState,
  play as playState,
  playheadAt,
  seek as seekState,
  setRate as setRateState,
  type PlaybackRate,
  type PlaybackState,
} from "../../domain/playback-clock";

export type PlaybackSessionStatus = "upcoming" | "live" | "finished" | "cancelled";

export interface PlaybackSession {
  key: number;
  name: string;
  type: string;
  /** ISO 8601. */
  start: string;
  end: string;
  status: PlaybackSessionStatus;
}

interface PlaybackContextValue {
  session: PlaybackSession;
  sessionStart: number;
  sessionEnd: number;
  raceLike: boolean;
  status: PlaybackSessionStatus;
  /** null while the session has not started (or was cancelled): nothing to play. */
  state: PlaybackState | null;
  /** Current session time (epoch ms). Cheap and stable: read it every animation frame. */
  getPlayhead: () => number;
  play: () => void;
  pause: () => void;
  seek: (sessionTime: number) => void;
  setRate: (rate: PlaybackRate) => void;
}

const PlaybackContext = createContext<PlaybackContextValue | null>(null);

function statusAt(session: PlaybackSession, start: number, end: number, now: Date | null): PlaybackSessionStatus {
  if (session.status === "cancelled" || !now) return session.status;
  const t = now.getTime();
  return t < start ? "upcoming" : t < end ? "live" : "finished";
}

function stateFor(status: PlaybackSessionStatus, start: number, end: number, initial?: number): PlaybackState | null {
  const wall = Date.now();
  if (status === "live") return createLiveState(start, end, wall);
  if (status === "finished") return createReplayState(start, end, wall, initial);
  return null;
}

export interface PlaybackProviderProps {
  session: PlaybackSession;
  /** Replay starting point, seconds after the session start (from `?t=`). */
  initialOffsetSeconds?: number;
  children: ReactNode;
}

/**
 * Owns the one playback clock of the selected session. Live sessions follow
 * the wall clock with a small delay; finished ones replay. The status is
 * re-derived every second, so an upcoming session switches to live (and a
 * live one to replay) without a reload.
 */
export function PlaybackProvider({ session, initialOffsetSeconds, children }: PlaybackProviderProps) {
  const sessionStart = Date.parse(session.start);
  const sessionEnd = Date.parse(session.end);
  const now = useNow();
  const status = statusAt(session, sessionStart, sessionEnd, now);
  const initial = initialOffsetSeconds === undefined ? undefined : sessionStart + initialOffsetSeconds * 1000;

  const [clock, setClock] = useState(() => ({
    status: session.status,
    state: stateFor(session.status, sessionStart, sessionEnd, initial),
  }));
  if (clock.status !== status) setClock({ status, state: stateFor(status, sessionStart, sessionEnd) });

  const stateRef = useRef(clock.state);
  useEffect(() => {
    stateRef.current = clock.state;
  }, [clock.state]);

  const getPlayhead = useCallback(() => {
    const state = stateRef.current;
    return state ? playheadAt(state, Date.now()) : sessionStart;
  }, [sessionStart]);

  const update = useCallback((change: (state: PlaybackState, wall: number) => PlaybackState) => {
    setClock((c) => (c.state ? { ...c, state: change(c.state, Date.now()) } : c));
  }, [setClock]);

  const value = useMemo<PlaybackContextValue>(
    () => ({
      session,
      sessionStart,
      sessionEnd,
      raceLike: isRaceLike({ sessionName: session.name, sessionType: session.type }),
      status,
      state: clock.state,
      getPlayhead,
      play: () => update(playState),
      pause: () => update(pauseState),
      seek: (t) => update((s, wall) => seekState(s, wall, t)),
      setRate: (rate) => update((s, wall) => setRateState(s, wall, rate)),
    }),
    [session, sessionStart, sessionEnd, status, clock.state, getPlayhead, update],
  );

  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

export function usePlayback(): PlaybackContextValue {
  const value = useContext(PlaybackContext);
  if (!value) throw new Error("usePlayback must be used inside <PlaybackProvider>");
  return value;
}

/**
 * The playhead, re-rendering the caller every `intervalMs` (and on any
 * play/pause/seek). null until mounted, so server and client markup match.
 */
export function usePlayhead(intervalMs = 1000): number | null {
  const { state } = usePlayback();
  const [playhead, setPlayhead] = useState<number | null>(null);
  useEffect(() => {
    if (!state) return;
    // From `state` itself, not getPlayhead(): this (child) effect runs before
    // the provider's effect refreshes the ref behind getPlayhead, so a seek
    // while paused would otherwise read the old playhead and stay there.
    const tick = () => setPlayhead(playheadAt(state, Date.now()));
    tick();
    if (state.mode === "replay" && !state.playing) return;
    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [state, intervalMs]);
  return state ? playhead : null;
}
