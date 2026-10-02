import { Badge } from "@/shared/ui/atoms/Badge";
import type { PlaybackRate } from "../../domain/playback-clock";
import styles from "./PlaybackControls.module.css";

export interface ReplayControlsProps {
  playing: boolean;
  rate: PlaybackRate;
  rates: readonly PlaybackRate[];
  /** Milliseconds since the session start. */
  elapsedMs: number;
  durationMs: number;
  elapsedLabel: string;
  durationLabel: string;
  /** Wall-clock time of the playhead in the viewer's zone, e.g. "14:03:12". */
  clockLabel: string;
  onPlay: () => void;
  onPause: () => void;
  onRate: (rate: PlaybackRate) => void;
  onSeek: (elapsedMs: number) => void;
}

/** Replay transport: play/pause, scrubber across the session, speed. */
export function ReplayControls(props: ReplayControlsProps) {
  const { playing, rate, rates, elapsedMs, durationMs, elapsedLabel, durationLabel, clockLabel } = props;
  return (
    <div className={styles.controls} role="group" aria-label="Replay controls">
      <button
        type="button"
        className={styles.play}
        onClick={playing ? props.onPause : props.onPlay}
        aria-label={playing ? "Pause replay" : "Play replay"}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
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
      <div className={styles.scrub}>
        <input
          type="range"
          className={styles.range}
          min={0}
          max={durationMs}
          step={1000}
          value={Math.min(elapsedMs, durationMs)}
          aria-label="Session time"
          aria-valuetext={`${elapsedLabel} of ${durationLabel}`}
          onChange={(event) => props.onSeek(Number(event.currentTarget.value))}
        />
        <div className={styles.times}>
          <span>{elapsedLabel}</span>
          <span>{clockLabel}</span>
          <span>{durationLabel}</span>
        </div>
      </div>
      <div className={styles.rates} role="group" aria-label="Playback speed">
        {rates.map((r) => (
          <button key={r} type="button" className={styles.rate} aria-pressed={r === rate} onClick={() => props.onRate(r)}>
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}

export function LiveIndicator({ delaySeconds }: { delaySeconds: number }) {
  return (
    <div className={styles.live}>
      <Badge tone="live">Live</Badge>
      <span>Car positions and timing run {delaySeconds} s behind real time so movement stays smooth.</span>
    </div>
  );
}
