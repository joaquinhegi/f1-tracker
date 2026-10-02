import type { Meeting, WeekendSession } from "./weekend";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type MeetingPhase = "current" | "upcoming" | "finished";

export interface SelectedMeeting {
  meeting: Meeting;
  phase: MeetingPhase;
}

/** Midnight (circuit local time) of the day containing `instant`, as a UTC instant. */
export function startOfLocalDay(instant: Date, utcOffsetMinutes: number): Date {
  const offsetMs = utcOffsetMinutes * MINUTE;
  const local = instant.getTime() + offsetMs;
  return new Date(Math.floor(local / DAY) * DAY - offsetMs);
}

/**
 * The days a meeting occupies, in the circuit's local calendar: from the
 * local midnight before its first session to the local midnight after its
 * last one. Sessions extend the meeting's own published range.
 */
export function meetingSpan(
  meeting: Meeting,
  sessions: readonly WeekendSession[],
): { from: Date; to: Date } {
  const own = sessions.filter((s) => s.meetingKey === meeting.key);
  const starts = [meeting.start, ...own.map((s) => s.start)].map((d) => d.getTime());
  const ends = [meeting.end, ...own.map((s) => s.end)].map((d) => d.getTime());
  const first = new Date(Math.min(...starts));
  const last = new Date(Math.max(...ends));
  const from = startOfLocalDay(first, meeting.utcOffsetMinutes);
  const lastDay = startOfLocalDay(last, meeting.utcOffsetMinutes);
  return { from, to: new Date(lastDay.getTime() + DAY) };
}

/**
 * Current meeting (now inside its local days), else the next upcoming one,
 * else the most recent finished one. Cancelled meetings are ignored.
 */
export function selectMeeting(
  meetings: readonly Meeting[],
  sessions: readonly WeekendSession[],
  now: Date,
): SelectedMeeting | null {
  const t = now.getTime();
  const spans = meetings
    .filter((m) => !m.isCancelled)
    .map((meeting) => ({ meeting, ...meetingSpan(meeting, sessions) }))
    .sort((a, b) => a.from.getTime() - b.from.getTime());

  const current = spans.find((s) => s.from.getTime() <= t && t < s.to.getTime());
  if (current) return { meeting: current.meeting, phase: "current" };

  const next = spans.find((s) => s.from.getTime() > t);
  if (next) return { meeting: next.meeting, phase: "upcoming" };

  const last = spans.at(-1);
  return last ? { meeting: last.meeting, phase: "finished" } : null;
}
