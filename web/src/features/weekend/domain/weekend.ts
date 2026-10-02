/** Weekend domain model. Pure TypeScript: no framework, no I/O. */

export type SessionKind =
  | "practice-1"
  | "practice-2"
  | "practice-3"
  | "sprint-qualifying"
  | "sprint"
  | "qualifying"
  | "race"
  | "other";

export type SessionStatus = "upcoming" | "live" | "finished" | "cancelled";

export interface Meeting {
  key: number;
  name: string;
  officialName: string;
  countryName: string;
  countryCode: string;
  countryFlagUrl: string | null;
  location: string;
  circuitKey: number;
  circuitName: string;
  /** Circuit UTC offset in minutes (e.g. +480 for "08:00:00"). */
  utcOffsetMinutes: number;
  start: Date;
  end: Date;
  isCancelled: boolean;
}

export interface WeekendSession {
  key: number;
  meetingKey: number;
  name: string;
  type: string;
  kind: SessionKind;
  start: Date;
  end: Date;
  isCancelled: boolean;
}

const KIND_BY_NAME: Record<string, SessionKind> = {
  "practice 1": "practice-1",
  "practice 2": "practice-2",
  "practice 3": "practice-3",
  "sprint qualifying": "sprint-qualifying",
  "sprint shootout": "sprint-qualifying", // 2023 name
  sprint: "sprint",
  qualifying: "qualifying",
  race: "race",
};

export function sessionKind(name: string): SessionKind {
  return KIND_BY_NAME[name.trim().toLowerCase()] ?? "other";
}

const SHORT_LABEL: Record<SessionKind, string> = {
  "practice-1": "FP1",
  "practice-2": "FP2",
  "practice-3": "FP3",
  "sprint-qualifying": "SQ",
  sprint: "Sprint",
  qualifying: "Quali",
  race: "Race",
  other: "",
};

/** Compact tab label: FP1, SQ, Quali... falls back to the session name. */
export function sessionShortLabel(session: Pick<WeekendSession, "kind" | "name">): string {
  return SHORT_LABEL[session.kind] || session.name;
}

/** "08:00:00" -> 480, "-05:00:00" -> -300. Unknown formats -> 0. */
export function parseUtcOffset(gmtOffset: string | null | undefined): number {
  const match = /^([+-])?(\d{1,2}):(\d{2})(?::\d{2})?$/.exec((gmtOffset ?? "").trim());
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3]));
}

export function sortByStart<T extends { start: Date }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.start.getTime() - b.start.getTime());
}
