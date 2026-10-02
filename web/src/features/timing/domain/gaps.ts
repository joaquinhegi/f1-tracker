/**
 * Gap to the car ahead and to the car behind, for rows already in running order.
 *
 * - Race / Sprint: from OpenF1 `intervals`. A driver's `interval` is its gap
 *   to the car ahead; the gap to the car behind is the next car's `interval`.
 * - Practice / Qualifying: from best laps. Ahead = own best - best of the car
 *   ahead; behind = best of the car behind - own best. Without both best laps
 *   there is no gap.
 */
import type { Gap } from "./timing";

export interface GapPair {
  ahead: Gap | null;
  behind: Gap | null;
}

export function raceGaps(intervalsInOrder: ReadonlyArray<Gap | null>): GapPair[] {
  return intervalsInOrder.map((interval, i) => ({
    ahead: i === 0 ? null : interval,
    behind: intervalsInOrder[i + 1] ?? null,
  }));
}

const delta = (slower: number | null, faster: number | null): Gap | null =>
  slower === null || faster === null ? null : { kind: "time", seconds: slower - faster };

export function bestLapGaps(bestLapsInOrder: ReadonlyArray<number | null>): GapPair[] {
  return bestLapsInOrder.map((best, i) => ({
    ahead: i === 0 ? null : delta(best, bestLapsInOrder[i - 1]),
    behind: i + 1 < bestLapsInOrder.length ? delta(bestLapsInOrder[i + 1], best) : null,
  }));
}
