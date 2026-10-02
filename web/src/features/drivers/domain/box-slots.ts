/**
 * Which pit box each car parks in on the map. Pure.
 *
 * Teams are grouped (teammates side by side, like real garages) and ordered
 * by their lowest car number, teammates by car number. The live feed has no
 * constructor standings (the real box order), and car numbers are stable for
 * a whole season, so a car always parks in the same place.
 */

export interface SlotDriver {
  number: number;
  teamName: string | null;
}

export interface BoxSlots {
  /** Driver number -> position along the box stretch, 0..1 (centre of its box). */
  fractions: Map<number, number>;
  /** Width of one car's box as a share of the stretch. */
  spacing: number;
}

/** Share of a team's garage left empty between two teams. */
const TEAM_GAP = 0.25;

export function boxSlots(drivers: readonly SlotDriver[]): BoxSlots {
  const teams = new Map<string, number[]>();
  for (const d of drivers) {
    const key = d.teamName ?? `#${d.number}`; // no team: a garage of its own
    teams.set(key, [...(teams.get(key) ?? []), d.number]);
  }
  const groups = [...teams.values()].map((numbers) => [...numbers].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0]);
  // Every car is one unit wide, every gap between teams TEAM_GAP units.
  const units = drivers.length + Math.max(0, groups.length - 1) * TEAM_GAP;
  const fractions = new Map<number, number>();
  let cursor = 0;
  groups.forEach((group, g) => {
    if (g > 0) cursor += TEAM_GAP;
    for (const number of group) {
      fractions.set(number, units === 0 ? 0.5 : (cursor + 0.5) / units);
      cursor += 1;
    }
  });
  return { fractions, spacing: units === 0 ? 1 : 1 / units };
}
