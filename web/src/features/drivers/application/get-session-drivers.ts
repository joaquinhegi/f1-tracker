import type { F1DataProvider } from "@/shared/f1-data/f1-data-provider";
import { driverFromOpenF1, type SessionDriversDto } from "./driver-dto";

/** Use case: the entry list of a session, one row per car (by number). */
export async function getSessionDrivers(provider: F1DataProvider, sessionKey: number): Promise<SessionDriversDto> {
  const rows = await provider.listDrivers({ sessionKey });
  // OpenF1 can repeat a driver (one row per update): keep the last one.
  const byNumber = new Map(rows.map((row) => [row.driver_number, row]));
  const drivers = [...byNumber.values()].map(driverFromOpenF1).sort((a, b) => a.number - b.number);
  return { sessionKey, drivers };
}
