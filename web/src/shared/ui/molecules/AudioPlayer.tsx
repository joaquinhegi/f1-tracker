"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./AudioPlayer.module.css";

/** Only one player sounds at a time: starting one pauses the others. */
const PLAY_EVENT = "f1-tracker:audio-play";

export interface AudioPlayerProps {
  src: string;
  /** Accessible name, e.g. "Team radio, NOR, 14:12:21". */
  label: string;
  /** CSS colour for the button and progress. */
  accent?: string;
  /** Icon colour on the accent button (pick one with AA contrast). Defaults to white. */
  accentText?: string;
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const s = Math.floor(value);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Compact audio player: play/pause, seekable progress, elapsed / duration.
 * A plain <audio> element (no `crossorigin`), so recordings play from F1's
 * static host without CORS; only metadata is preloaded.
 */
export function AudioPlayer({ src, label, accent, accentText }: AudioPlayerProps) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onOtherPlay = (event: Event) => {
      if ((event as CustomEvent<HTMLAudioElement>).detail !== audio.current) audio.current?.pause();
    };
    window.addEventListener(PLAY_EVENT, onOtherPlay);
    return () => window.removeEventListener(PLAY_EVENT, onOtherPlay);
  }, []);

  const toggle = async () => {
    const el = audio.current;
    if (!el) return;
    if (!el.paused) {
      el.pause();
      return;
    }
    window.dispatchEvent(new CustomEvent(PLAY_EVENT, { detail: el }));
    try {
      await el.play();
    } catch {
      setFailed(true);
    }
  };

  return (
    <div
      className={styles.player}
      style={
        accent
          ? ({ "--player-accent": accent, ...(accentText ? { "--player-accent-text": accentText } : {}) } as CSSProperties)
          : undefined
      }
    >
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onError={() => setFailed(true)}
      />
      <button
        type="button"
        className={styles.button}
        onClick={toggle}
        disabled={failed}
        aria-label={`${playing ? "Pause" : "Play"} ${label}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
          {playing ? (
            <>
              <rect x="3" y="2" width="3.5" height="12" rx="1" />
              <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
            </>
          ) : (
            <path d="M4 2.5v11a.75.75 0 0 0 1.14.64l9-5.5a.75.75 0 0 0 0-1.28l-9-5.5A.75.75 0 0 0 4 2.5Z" />
          )}
        </svg>
      </button>
      {failed ? (
        <span className={styles.error}>Audio unavailable</span>
      ) : (
        <>
          <input
            type="range"
            className={styles.range}
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            aria-label={`Seek ${label}`}
            aria-valuetext={`${formatSeconds(current)} of ${formatSeconds(duration)}`}
            onChange={(e) => {
              if (audio.current) audio.current.currentTime = Number(e.currentTarget.value);
            }}
          />
          <span className={styles.time}>
            {formatSeconds(playing || current > 0 ? current : duration)}
            {(playing || current > 0) && duration > 0 ? ` / ${formatSeconds(duration)}` : ""}
          </span>
        </>
      )}
    </div>
  );
}
