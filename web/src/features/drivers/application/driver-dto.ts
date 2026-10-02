/** JSON contract of GET /api/sessions/:sessionKey/drivers. Client-safe. */
import type { OpenF1Driver } from "@/shared/f1-data/f1-data-provider";
import { normalizeTeamColour, type Driver } from "../domain/driver";

export type DriverDto = Driver;

export interface SessionDriversDto {
  sessionKey: number;
  drivers: DriverDto[];
}

export function driverFromOpenF1(raw: OpenF1Driver): DriverDto {
  return {
    number: raw.driver_number,
    acronym: raw.name_acronym || String(raw.driver_number),
    fullName: raw.full_name || raw.broadcast_name || `Car ${raw.driver_number}`,
    teamName: raw.team_name ?? null,
    teamColour: normalizeTeamColour(raw.team_colour),
    headshotUrl: raw.headshot_url || null,
  };
}
