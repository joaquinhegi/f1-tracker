/** Copy of the radio feed's empty state. Pure, client-safe. */
import type { FeedEmptyState } from "../domain/radio";

export interface FeedEmptyCopy {
  title: string;
  message?: string;
  /** Present when the viewer can jump the replay to the first message. */
  jumpTo?: number;
}

export interface FeedEmptyCopyOptions {
  /** "this session" for all drivers, else the driver's acronym. */
  who: string | null;
  live: boolean;
  /** Formats a message's time, e.g. "14:12:21 (12:05 in)". */
  when: (date: number) => string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function feedEmptyCopy(state: FeedEmptyState, { who, live, when }: FeedEmptyCopyOptions): FeedEmptyCopy {
  if (state.kind === "none") {
    if (live) {
      return {
        title: who ? `No team radio from ${who} yet` : "No team radio yet",
        message: "Messages appear here as soon as they are published.",
      };
    }
    return {
      title: who ? `No team radio from ${who} in this session` : "No team radio in this session",
      message: who ? "Pick another driver, or All drivers." : "OpenF1 published no recordings for it.",
    };
  }
  const lap = state.first.lapNumber !== null ? `, lap ${state.first.lapNumber}` : "";
  return {
    title: `${plural(state.total, "message")} ${who ? `from ${who} ` : ""}in this session`,
    message: `The first one is at ${when(state.first.date)}${lap}. The replay has not reached it yet.`,
    jumpTo: state.first.date,
  };
}
