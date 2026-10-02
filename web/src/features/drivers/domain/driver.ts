/** Drivers domain model. Pure TypeScript: no framework, no I/O. */

export interface Driver {
  number: number;
  acronym: string;
  fullName: string;
  teamName: string | null;
  /** CSS colour, always "#RRGGBB". */
  teamColour: string;
  headshotUrl: string | null;
}

/** Neutral grey for drivers whose team colour is not published yet. */
export const FALLBACK_TEAM_COLOUR = "#8B949E";

/** OpenF1 publishes "F47600" (no '#'); anything else falls back to grey. */
export function normalizeTeamColour(raw: string | null | undefined): string {
  const hex = (raw ?? "").trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : FALLBACK_TEAM_COLOUR;
}

/** Drivers checked when the viewer has not chosen yet: the top of the order. */
export const DEFAULT_SELECTION_SIZE = 3;

export function defaultSelection(order: readonly number[], size = DEFAULT_SELECTION_SIZE): number[] {
  return order.slice(0, size);
}

/** Toggles one driver, keeping the selection in `order` order (stable storage). */
export function toggleDriver(selection: readonly number[], driverNumber: number): number[] {
  return selection.includes(driverNumber)
    ? selection.filter((n) => n !== driverNumber)
    : [...selection, driverNumber];
}
