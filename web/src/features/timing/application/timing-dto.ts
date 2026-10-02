/**
 * JSON contracts of GET /api/sessions/:sessionKey/timing and
 * GET /api/sessions/:sessionKey/intervals. Client-safe.
 */
import type {
  OpenF1Interval,
  OpenF1Lap,
  OpenF1Pit,
  OpenF1Position,
  OpenF1Stint,
} from "@/shared/f1-data/f1-data-provider";
import { parseGap } from "../domain/gap";
import type { Gap, IntervalSample, Lap, SessionTiming } from "../domain/timing";

export interface LapDto {
  driverNumber: number;
  lapNumber: number;
  start: string | null;
  sectors: [number | null, number | null, number | null];
  duration: number | null;
  isPitOutLap: boolean;
}

export interface StintDto {
  driverNumber: number;
  stintNumber: number;
  lapStart: number | null;
  lapEnd: number | null;
  compound: string | null;
  tyreAgeAtStart: number | null;
}

export interface PositionDto {
  driverNumber: number;
  date: string;
  position: number;
}

export interface PitDto {
  driverNumber: number;
  lapNumber: number;
  date: string;
}

/** The whole session's timing (small: ~1-2 k laps for a race). Clients cut it at the playhead. */
export interface SessionTimingDto {
  sessionKey: number;
  laps: LapDto[];
  stints: StintDto[];
  positions: PositionDto[];
  pits: PitDto[];
}

export interface IntervalDto {
  driverNumber: number;
  date: string;
  gapToLeader: Gap | null;
  interval: Gap | null;
}

export interface IntervalWindowDto {
  sessionKey: number;
  from: string;
  to: string;
  intervals: IntervalDto[];
}

export function lapToDto(raw: OpenF1Lap): LapDto {
  return {
    driverNumber: raw.driver_number,
    lapNumber: raw.lap_number,
    start: raw.date_start,
    sectors: [raw.duration_sector_1, raw.duration_sector_2, raw.duration_sector_3],
    duration: raw.lap_duration,
    isPitOutLap: Boolean(raw.is_pit_out_lap),
  };
}

export function stintToDto(raw: OpenF1Stint): StintDto {
  return {
    driverNumber: raw.driver_number,
    stintNumber: raw.stint_number,
    lapStart: raw.lap_start,
    lapEnd: raw.lap_end,
    compound: raw.compound,
    tyreAgeAtStart: raw.tyre_age_at_start,
  };
}

export function positionToDto(raw: OpenF1Position): PositionDto {
  return { driverNumber: raw.driver_number, date: raw.date, position: raw.position };
}

export function pitToDto(raw: OpenF1Pit): PitDto {
  return { driverNumber: raw.driver_number, lapNumber: raw.lap_number, date: raw.date };
}

export function intervalToDto(raw: OpenF1Interval): IntervalDto {
  return {
    driverNumber: raw.driver_number,
    date: raw.date,
    gapToLeader: parseGap(raw.gap_to_leader),
    interval: parseGap(raw.interval),
  };
}

const ms = (iso: string | null): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};

export function timingFromDto(dto: SessionTimingDto): SessionTiming {
  return {
    laps: dto.laps.map((l): Lap => ({ ...l, start: ms(l.start) })),
    stints: dto.stints,
    positions: dto.positions.map((p) => ({ ...p, date: ms(p.date) ?? 0 })),
    pits: dto.pits.map((p) => ({ ...p, date: ms(p.date) ?? 0 })),
  };
}

export function intervalsFromDto(dto: IntervalWindowDto): IntervalSample[] {
  return dto.intervals.map((i) => ({ ...i, date: ms(i.date) ?? 0 }));
}
