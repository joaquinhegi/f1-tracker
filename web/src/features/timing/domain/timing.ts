/** Timing domain model. Pure TypeScript: no framework, no I/O. Times are epoch ms, durations seconds. */

export interface Lap {
  driverNumber: number;
  lapNumber: number;
  /** Epoch ms the lap started, null if unknown. */
  start: number | null;
  sectors: [number | null, number | null, number | null];
  duration: number | null;
  isPitOutLap: boolean;
}

export interface Stint {
  driverNumber: number;
  stintNumber: number;
  lapStart: number | null;
  lapEnd: number | null;
  compound: string | null;
  tyreAgeAtStart: number | null;
}

export interface PositionChange {
  driverNumber: number;
  date: number;
  position: number;
}

export interface PitStop {
  driverNumber: number;
  /** The in-lap. */
  lapNumber: number;
  date: number;
}

/** A gap is either a time or a number of laps ("+1 LAP"). */
export type Gap = { kind: "time"; seconds: number } | { kind: "laps"; laps: number };

export interface IntervalSample {
  driverNumber: number;
  date: number;
  gapToLeader: Gap | null;
  /** Gap to the car ahead. */
  interval: Gap | null;
}

/** Sector / lap colour by F1 convention. */
export type TimeMark = "overall-best" | "personal-best" | "normal";

export interface SessionTiming {
  laps: Lap[];
  stints: Stint[];
  positions: PositionChange[];
  pits: PitStop[];
}
