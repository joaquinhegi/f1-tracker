import type { F1DataProvider } from "@/shared/f1-data/f1-data-provider";
import type { TimeWindow } from "@/shared/time/time-window";
import { locationsToDto, type LocationWindowDto } from "./location-dto";

/** Use case: every car's position samples in one window, from a single upstream call. */
export async function getLocationWindow(
  provider: F1DataProvider,
  sessionKey: number,
  { from, to }: TimeWindow,
): Promise<LocationWindowDto> {
  const rows = await provider.listLocations({ sessionKey, from, to });
  return locationsToDto(sessionKey, from, to, rows);
}
