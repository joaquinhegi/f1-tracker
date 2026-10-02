import type { Gap } from "./timing";

/**
 * OpenF1 `interval` / `gap_to_leader`: a number of seconds, a string such as
 * "+1 LAP" / "+3 LAPS" for lapped cars, or null (leader, no data yet).
 */
export function parseGap(raw: number | string | null | undefined): Gap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? { kind: "time", seconds: raw } : null;
  const text = raw.trim();
  const laps = /^\+?\s*(\d+)\s*L(?:APS?)?$/i.exec(text);
  if (laps) return { kind: "laps", laps: Number(laps[1]) };
  const seconds = /^\+?\s*(-?\d+(?:\.\d+)?)$/.exec(text);
  if (seconds) return { kind: "time", seconds: Number(seconds[1]) };
  return null;
}

/** "+0.523", "+12.3" style (3 decimals under 10 s, 1 above), "+1 LAP", "+2 LAPS". */
export function formatGap(gap: Gap | null): string {
  if (!gap) return "—";
  if (gap.kind === "laps") return `+${gap.laps} ${gap.laps === 1 ? "LAP" : "LAPS"}`;
  const abs = Math.abs(gap.seconds);
  const sign = gap.seconds < 0 ? "-" : "+";
  return `${sign}${abs < 10 ? abs.toFixed(3) : abs.toFixed(1)}`;
}

/** Lap / sector time: "1:28.123" or "28.123". */
export function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return minutes > 0 ? `${minutes}:${rest.toFixed(3).padStart(6, "0")}` : rest.toFixed(3);
}
