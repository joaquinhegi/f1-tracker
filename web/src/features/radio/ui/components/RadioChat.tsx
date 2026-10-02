"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Driver } from "@/features/drivers/domain/driver";
import { SURFACE_COLOUR } from "@/shared/theme/theme";
import { labelColours, readableColourOn } from "@/shared/ui/format/colour";
import { AudioPlayer } from "@/shared/ui/molecules/AudioPlayer";
import styles from "./RadioChat.module.css";

export interface ChatMessage {
  id: string;
  driver: Driver;
  recordingUrl: string;
  /** Viewer-local time, e.g. "14:12:21". */
  timeLabel: string;
  lapNumber: number | null;
}

export interface RadioPickerOption {
  driver: Driver;
  /** Messages in the whole session. */
  count: number;
}

export interface RadioEmpty {
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export interface RadioChatProps {
  /** "all": every driver's messages (group chat); a number: that driver only. */
  filter: "all" | number;
  options: RadioPickerOption[];
  /** Messages in the whole session, all drivers. */
  totalCount: number;
  messages: ChatMessage[];
  onFilterChange: (filter: "all" | number) => void;
  /** Shown when `messages` is empty. */
  empty: RadioEmpty;
}

/** Within this many px of the bottom the viewer is "following" the chat. */
const STICK_THRESHOLD_PX = 48;
/**
 * Driver name in the team colour, tuned to read on the bubble surface
 * (--color-surface) of each theme; the stylesheet picks the active one.
 */
const senderColours = (teamColour: string) =>
  ({
    "--sender-on-dark": readableColourOn(teamColour, SURFACE_COLOUR.dark),
    "--sender-on-light": readableColourOn(teamColour, SURFACE_COLOUR.light),
  }) as CSSProperties;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function Avatar({ driver }: { driver: Driver }) {
  const label = labelColours(driver.teamColour);
  return (
    <span
      className={styles.avatar}
      aria-hidden="true"
      style={{ "--avatar-bg": label.background, "--avatar-fg": label.text, "--avatar-ring": driver.teamColour } as CSSProperties}
    >
      {driver.headshotUrl ? (
        // Remote headshot from media.formula1.com; tiny, so no next/image config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={driver.headshotUrl} alt="" loading="lazy" width={32} height={32} />
      ) : (
        driver.acronym
      )}
    </span>
  );
}

function RadioIcon() {
  return (
    <span className={styles.groupIcon} aria-hidden="true">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 12a7 7 0 0 1 14 0" />
        <path d="M8.5 12a3.5 3.5 0 0 1 7 0" />
        <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        <path d="M12 13.5V20" />
      </svg>
    </span>
  );
}

/**
 * Organism: team radio as a chat, newest at the bottom. "All drivers" is a
 * group chat (every bubble names its driver in the team colour); the picker
 * narrows it to one driver and shows how many messages each driver has in
 * the session (drivers with none are disabled). It follows new messages
 * while the viewer is at the bottom; if they scrolled up to listen to an
 * older one, a "new messages" pill appears instead.
 */
export function RadioChat({ filter, options, totalCount, messages, onFilterChange, empty }: RadioChatProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const seen = useRef(messages.length);
  const [unseen, setUnseen] = useState(0);
  const [shownFilter, setShownFilter] = useState(filter);
  if (shownFilter !== filter) {
    // A different conversation starts read, at the bottom.
    setShownFilter(filter);
    setUnseen(0);
  }

  const scrollToBottom = (smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: smooth && !reduce ? "smooth" : "auto" });
    else el.scrollTop = el.scrollHeight;
  };

  useLayoutEffect(() => {
    following.current = true;
    seen.current = messages.length;
    scrollToBottom(false);
    // Only on filter change; new messages are handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  useEffect(() => {
    const added = messages.length - seen.current;
    seen.current = messages.length;
    if (added <= 0) return;
    if (following.current) scrollToBottom(true);
    else setUnseen((n) => n + added);
  }, [messages.length]);

  const selected = filter === "all" ? null : (options.find((o) => o.driver.number === filter) ?? null);
  const driver = selected?.driver ?? null;
  const accent = { "--bubble-accent": driver?.teamColour ?? "var(--color-accent-fill)" } as CSSProperties;

  return (
    <div className={styles.chat} style={accent}>
      <div className={styles.header}>
        <div className={styles.who}>
          {driver ? <Avatar driver={driver} /> : <RadioIcon />}
          <div>
            <p className={styles.name}>{driver ? driver.fullName : "All drivers"}</p>
            <p className={styles.team}>
              {driver
                ? [driver.teamName, plural(selected?.count ?? 0, "message")].filter(Boolean).join(" · ")
                : `${plural(totalCount, "message")} in this session`}
            </p>
          </div>
        </div>
        <label className={styles.picker}>
          Driver
          <select
            className={styles.select}
            value={filter === "all" ? "all" : String(filter)}
            onChange={(e) => {
              const value = e.currentTarget.value;
              onFilterChange(value === "all" ? "all" : Number(value));
            }}
          >
            <option value="all">All drivers ({totalCount})</option>
            {options.map(({ driver: d, count }) => (
              <option key={d.number} value={d.number} disabled={count === 0}>
                {d.acronym} · {d.fullName} ({count})
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className={styles.note}>Team radio is audio only: OpenF1 publishes recordings, not transcripts.</p>
      <div className={styles.frame}>
        <div
          ref={scroller}
          className={styles.scroll}
          role="log"
          aria-label={driver ? `Team radio of ${driver.fullName}` : "Team radio of all drivers"}
          tabIndex={0}
          onScroll={(e) => {
            const el = e.currentTarget;
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX;
            if (following.current) setUnseen(0);
          }}
        >
          {messages.length === 0 && (
            <div className={styles.empty}>
              <p className={styles.emptyTitle}>{empty.title}</p>
              {empty.message && <p>{empty.message}</p>}
              {empty.action && (
                <button type="button" className={styles.emptyAction} onClick={empty.action.onClick}>
                  {empty.action.label}
                </button>
              )}
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={styles.message}>
              <Avatar driver={m.driver} />
              <div className={styles.bubble} style={{ "--bubble-accent": m.driver.teamColour } as CSSProperties}>
                {filter === "all" && (
                  <p className={styles.sender} style={senderColours(m.driver.teamColour)}>
                    {m.driver.acronym}
                    <span className={styles.senderName}>{m.driver.fullName}</span>
                  </p>
                )}
                <AudioPlayer
                  src={m.recordingUrl}
                  label={`team radio of ${m.driver.acronym} at ${m.timeLabel}`}
                  accent={labelColours(m.driver.teamColour).background}
                  accentText={labelColours(m.driver.teamColour).text}
                />
                <p className={styles.meta}>
                  {m.lapNumber !== null && <span>Lap {m.lapNumber}</span>}
                  <time>{m.timeLabel}</time>
                </p>
              </div>
            </div>
          ))}
        </div>
        {unseen > 0 && (
          <button
            type="button"
            className={styles.pill}
            onClick={() => {
              following.current = true;
              setUnseen(0);
              scrollToBottom(true);
            }}
          >
            {plural(unseen, "new message")} ↓
          </button>
        )}
      </div>
    </div>
  );
}
