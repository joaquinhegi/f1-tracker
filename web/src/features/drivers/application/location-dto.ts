/** JSON contract of GET /api/sessions/:sessionKey/locations. Client-safe. */
import type { OpenF1Location } from "@/shared/f1-data/f1-data-provider";
import type { LocationSample } from "../domain/car-position";

export interface LocationWindowDto {
  sessionKey: number;
  /** Inclusive, ISO 8601. */
  from: string;
  /** Exclusive, ISO 8601. */
  to: string;
  /**
   * Per driver number, a flat list of triples `[msSinceFrom, x, y, ...]`
   * sorted by time, in raw OpenF1 coordinates (project with the outline's
   * transform). Flat numbers keep a 60 s window of 22 cars around 60 KB.
   */
  drivers: Record<string, number[]>;
}

export function locationsToDto(sessionKey: number, from: Date, to: Date, rows: readonly OpenF1Location[]): LocationWindowDto {
  const base = from.getTime();
  const byDriver = new Map<number, Array<[number, number, number]>>();
  for (const row of rows) {
    // The feed reports (0, 0) for cars it cannot place.
    if (!Number.isFinite(row.x) || !Number.isFinite(row.y) || (row.x === 0 && row.y === 0)) continue;
    const t = Date.parse(row.date) - base;
    if (!Number.isFinite(t)) continue;
    let list = byDriver.get(row.driver_number);
    if (!list) byDriver.set(row.driver_number, (list = []));
    list.push([t, row.x, row.y]);
  }
  const drivers: Record<string, number[]> = {};
  for (const [driverNumber, list] of byDriver) {
    list.sort((a, b) => a[0] - b[0]);
    drivers[driverNumber] = list.flat();
  }
  return { sessionKey, from: from.toISOString(), to: to.toISOString(), drivers };
}

export function samplesFromDto(dto: LocationWindowDto): Map<number, LocationSample[]> {
  const base = Date.parse(dto.from);
  const out = new Map<number, LocationSample[]>();
  for (const [key, flat] of Object.entries(dto.drivers)) {
    const samples: LocationSample[] = [];
    for (let i = 0; i + 2 < flat.length; i += 3) samples.push({ t: base + flat[i], x: flat[i + 1], y: flat[i + 2] });
    out.set(Number(key), samples);
  }
  return out;
}
