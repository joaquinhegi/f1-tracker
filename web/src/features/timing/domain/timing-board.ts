/**
 * The timing board at one instant `t` of the session (the playback clock):
 * only what had happened by `t` is used, so a replay never shows the future.
 */
import { bestLapGaps, raceGaps } from "./gaps";
import { racePace } from "./pace";
import { markTime, minOrNull } from "./sectors";
import type { Gap, IntervalSample, Lap, SessionTiming, Stint, TimeMark } from "./timing";

export interface SectorCell {
  seconds: number;
  mark: TimeMark;
  /** From the previous lap: the current lap has not reached this sector yet. */
  previous: boolean;
}

export interface TimingRow {
  driverNumber: number;
  position: number | null;
  /** Lap in progress (or last lap started). */
  currentLap: number | null;
  lastLap: { seconds: number | null; mark: TimeMark; pitOut: boolean } | null;
  sectors: [SectorCell | null, SectorCell | null, SectorCell | null];
  bestLap: { seconds: number; mark: TimeMark } | null;
  pace: number | null;
  tyre: { compound: string | null; age: number | null } | null;
  gapAhead: Gap | null;
  gapBehind: Gap | null;
}

export interface TimingBoardInput {
  timing: SessionTiming;
  /** Interval samples around `t` (race-like sessions only). */
  intervals: readonly IntervalSample[];
  /** Entry list, so drivers without any data yet still get a row. */
  driverNumbers: readonly number[];
  raceLike: boolean;
}

interface LapAtT {
  lap: Lap;
  completed: boolean;
  /** Sector times the car had crossed by t. */
  revealed: [number | null, number | null, number | null];
}

function lapAt(lap: Lap, t: number): LapAtT | null {
  if (lap.start === null || lap.start > t) return null;
  const revealed: LapAtT["revealed"] = [null, null, null];
  let elapsed = 0;
  for (let i = 0; i < 3; i++) {
    const sector = lap.sectors[i];
    if (sector === null) break;
    elapsed += sector;
    if (lap.start + elapsed * 1000 > t) break;
    revealed[i] = sector;
  }
  const end = lap.duration !== null ? lap.start + lap.duration * 1000 : revealed[2] !== null ? lap.start + elapsed * 1000 : null;
  return { lap, completed: end !== null && end <= t, revealed };
}

function latestAt<T extends { driverNumber: number; date: number }>(rows: readonly T[], t: number): Map<number, T> {
  const latest = new Map<number, T>();
  for (const row of rows) {
    if (row.date > t) continue;
    const current = latest.get(row.driverNumber);
    if (!current || row.date >= current.date) latest.set(row.driverNumber, row);
  }
  return latest;
}

function groupBy<T>(rows: readonly T[], key: (row: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}

export function buildTimingBoard(input: TimingBoardInput, t: number): TimingRow[] {
  const { timing, intervals, raceLike } = input;

  const lapsByDriver = new Map<number, LapAtT[]>();
  for (const [driver, laps] of groupBy(timing.laps, (l) => l.driverNumber)) {
    const started = laps
      .map((lap) => lapAt(lap, t))
      .filter((l): l is LapAtT => l !== null)
      .sort((a, b) => a.lap.lapNumber - b.lap.lapNumber);
    lapsByDriver.set(driver, started);
  }

  const all = [...lapsByDriver.values()].flat();
  const overallSector = [0, 1, 2].map((i) => minOrNull(all.map((l) => l.revealed[i])));
  const overallLap = minOrNull(all.filter((l) => l.completed).map((l) => l.lap.duration));

  const pitsByDriver = groupBy(
    timing.pits.filter((p) => p.date <= t),
    (p) => p.driverNumber,
  );
  const stintsByDriver = groupBy(timing.stints, (s) => s.driverNumber);
  const positions = latestAt(timing.positions, t);
  const latestIntervals = latestAt(intervals, t);

  const driverNumbers = new Set<number>([...input.driverNumbers, ...lapsByDriver.keys(), ...positions.keys()]);

  const rows = [...driverNumbers].map((driverNumber): TimingRow => {
    const laps = lapsByDriver.get(driverNumber) ?? [];
    const completed = laps.filter((l) => l.completed);
    const current = laps.at(-1) ?? null;
    const previous = current?.completed ? null : (completed.at(-1) ?? null);
    const personalSector = [0, 1, 2].map((i) => minOrNull(laps.map((l) => l.revealed[i])));
    const personalLap = minOrNull(completed.map((l) => l.lap.duration));
    const last = completed.at(-1) ?? null;

    const sectors = [0, 1, 2].map((i): SectorCell | null => {
      const own = current?.revealed[i] ?? null;
      const value = own ?? previous?.revealed[i] ?? null;
      if (value === null) return null;
      return { seconds: value, mark: markTime(value, personalSector[i], overallSector[i]), previous: own === null };
    }) as TimingRow["sectors"];

    const pitInLaps = new Set((pitsByDriver.get(driverNumber) ?? []).map((p) => p.lapNumber));
    const currentLap = current?.lap.lapNumber ?? null;

    return {
      driverNumber,
      position: positions.get(driverNumber)?.position ?? null,
      currentLap,
      lastLap: last
        ? { seconds: last.lap.duration, mark: markTime(last.lap.duration, personalLap, overallLap), pitOut: last.lap.isPitOutLap }
        : null,
      sectors,
      bestLap: personalLap === null ? null : { seconds: personalLap, mark: markTime(personalLap, personalLap, overallLap) },
      pace: racePace(completed.map((l) => l.lap), pitInLaps),
      tyre: tyreAt(stintsByDriver.get(driverNumber) ?? [], currentLap),
      gapAhead: null,
      gapBehind: null,
    };
  });

  // Race: the official running order (position feed). Practice / qualifying:
  // the order of best laps set by t, so positions and best-lap gaps agree even
  // where the position feed lags; cars without a lap follow, by feed position.
  rows.sort(
    raceLike
      ? (a, b) =>
          (a.position ?? Infinity) - (b.position ?? Infinity) ||
          (a.bestLap?.seconds ?? Infinity) - (b.bestLap?.seconds ?? Infinity) ||
          a.driverNumber - b.driverNumber
      : (a, b) =>
          (a.bestLap?.seconds ?? Infinity) - (b.bestLap?.seconds ?? Infinity) ||
          (a.position ?? Infinity) - (b.position ?? Infinity) ||
          a.driverNumber - b.driverNumber,
  );
  if (!raceLike) rows.forEach((row, i) => (row.position = row.bestLap ? i + 1 : row.position));

  const gaps = raceLike
    ? raceGaps(rows.map((r) => latestIntervals.get(r.driverNumber)?.interval ?? null))
    : bestLapGaps(rows.map((r) => r.bestLap?.seconds ?? null));
  rows.forEach((row, i) => {
    row.gapAhead = gaps[i].ahead;
    row.gapBehind = gaps[i].behind;
  });
  return rows;
}

/**
 * Tyre fitted on `lap`: the latest stint that started on or before it (a live
 * stint's `lap_end` lags behind, so it is not trusted), and its age in laps.
 */
export function tyreAt(stints: readonly Stint[], lap: number | null): TimingRow["tyre"] {
  const onLap = lap ?? 1;
  const stint = [...stints]
    .sort((a, b) => a.stintNumber - b.stintNumber)
    .filter((s) => (s.lapStart ?? 1) <= onLap)
    .at(-1);
  if (!stint) return null;
  const age = stint.tyreAgeAtStart === null ? null : stint.tyreAgeAtStart + (onLap - (stint.lapStart ?? onLap));
  return { compound: stint.compound, age };
}
