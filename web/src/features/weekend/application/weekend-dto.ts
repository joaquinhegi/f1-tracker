/**
 * JSON contract of GET /api/weekend/current. Shared by the BFF (serialize)
 * and the browser (deserialize), so it must stay framework- and I/O-free.
 */
import type { MeetingPhase } from "../domain/select-meeting";
import { sessionStatus } from "../domain/session-status";
import {
  sessionShortLabel,
  type Meeting,
  type SessionKind,
  type SessionStatus,
  type WeekendSession,
} from "../domain/weekend";

export interface MeetingDto {
  key: number;
  name: string;
  officialName: string;
  countryName: string;
  countryCode: string;
  countryFlagUrl: string | null;
  location: string;
  circuitKey: number;
  circuitName: string;
  utcOffsetMinutes: number;
  start: string;
  end: string;
}

export interface SessionDto {
  key: number;
  meetingKey: number;
  name: string;
  shortLabel: string;
  type: string;
  kind: SessionKind;
  start: string;
  end: string;
  isCancelled: boolean;
  /** Status when the response was generated; clients recompute it as time passes. */
  status: SessionStatus;
}

export interface WeekendOverviewDto {
  generatedAt: string;
  phase: MeetingPhase;
  meeting: MeetingDto;
  sessions: SessionDto[];
  selectedSessionKey: number | null;
}

export function meetingToDto(m: Meeting): MeetingDto {
  return {
    key: m.key,
    name: m.name,
    officialName: m.officialName,
    countryName: m.countryName,
    countryCode: m.countryCode,
    countryFlagUrl: m.countryFlagUrl,
    location: m.location,
    circuitKey: m.circuitKey,
    circuitName: m.circuitName,
    utcOffsetMinutes: m.utcOffsetMinutes,
    start: m.start.toISOString(),
    end: m.end.toISOString(),
  };
}

export function sessionToDto(s: WeekendSession, now: Date): SessionDto {
  return {
    key: s.key,
    meetingKey: s.meetingKey,
    name: s.name,
    shortLabel: sessionShortLabel(s),
    type: s.type,
    kind: s.kind,
    start: s.start.toISOString(),
    end: s.end.toISOString(),
    isCancelled: s.isCancelled,
    status: sessionStatus(s, now),
  };
}

export function sessionFromDto(dto: SessionDto): WeekendSession {
  return {
    key: dto.key,
    meetingKey: dto.meetingKey,
    name: dto.name,
    type: dto.type,
    kind: dto.kind,
    start: new Date(dto.start),
    end: new Date(dto.end),
    isCancelled: dto.isCancelled,
  };
}
