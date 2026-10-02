import type { F1DataProvider } from "@/shared/f1-data/f1-data-provider";
import { isAllowedRecordingUrl, lapNumberAt } from "../domain/radio";
import type { TeamRadioDto } from "./radio-dto";

/**
 * Use case: a session's team radio, each message tagged with the lap the
 * driver was on. OpenF1 publishes audio only (no transcript).
 */
export async function getTeamRadio(provider: F1DataProvider, sessionKey: number): Promise<TeamRadioDto> {
  const [radio, laps] = await Promise.all([provider.listTeamRadio({ sessionKey }), provider.listLaps({ sessionKey })]);

  const lapStartsByDriver = new Map<number, Array<{ lapNumber: number; start: number | null }>>();
  for (const lap of laps) {
    const list = lapStartsByDriver.get(lap.driver_number) ?? [];
    list.push({ lapNumber: lap.lap_number, start: lap.date_start ? Date.parse(lap.date_start) : null });
    lapStartsByDriver.set(lap.driver_number, list);
  }

  const messages = radio
    .filter((r) => isAllowedRecordingUrl(r.recording_url) && Number.isFinite(Date.parse(r.date)))
    .map((r) => ({
      driverNumber: r.driver_number,
      date: r.date,
      recordingUrl: r.recording_url,
      lapNumber: lapNumberAt(lapStartsByDriver.get(r.driver_number) ?? [], Date.parse(r.date)),
    }))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));

  return { sessionKey, messages };
}
