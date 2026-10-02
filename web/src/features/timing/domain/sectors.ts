/**
 * Sector and lap colours (F1 convention): purple = fastest of the session so
 * far, green = the driver's own best so far, otherwise normal (yellow).
 */
import type { TimeMark } from "./timing";

const EPSILON = 1e-6;

export function markTime(value: number | null, personalBest: number | null, overallBest: number | null): TimeMark {
  if (value === null) return "normal";
  if (overallBest !== null && value <= overallBest + EPSILON) return "overall-best";
  if (personalBest !== null && value <= personalBest + EPSILON) return "personal-best";
  return "normal";
}

export function minOrNull(values: Iterable<number | null>): number | null {
  let best: number | null = null;
  for (const v of values) if (v !== null && (best === null || v < best)) best = v;
  return best;
}
