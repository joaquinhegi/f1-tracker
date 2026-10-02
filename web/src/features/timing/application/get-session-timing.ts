import type { F1DataProvider } from "@/shared/f1-data/f1-data-provider";
import type { TimeWindow } from "@/shared/time/time-window";
import {
  intervalToDto,
  lapToDto,
  pitToDto,
  positionToDto,
  stintToDto,
  type IntervalWindowDto,
  type SessionTimingDto,
} from "./timing-dto";

/** Use case: laps, stints, positions and pit stops of a session (4 cached upstream calls). */
export async function getSessionTiming(provider: F1DataProvider, sessionKey: number): Promise<SessionTimingDto> {
  const [laps, stints, positions, pits] = await Promise.all([
    provider.listLaps({ sessionKey }),
    provider.listStints({ sessionKey }),
    provider.listPositions({ sessionKey }),
    provider.listPits({ sessionKey }),
  ]);
  return {
    sessionKey,
    laps: laps.map(lapToDto),
    stints: stints.map(stintToDto),
    positions: positions.map(positionToDto),
    pits: pits.map(pitToDto),
  };
}

/** Use case: every car's interval samples in one window (race-like sessions). */
export async function getIntervalWindow(
  provider: F1DataProvider,
  sessionKey: number,
  { from, to }: TimeWindow,
): Promise<IntervalWindowDto> {
  const rows = await provider.listIntervals({ sessionKey, from, to });
  return { sessionKey, from: from.toISOString(), to: to.toISOString(), intervals: rows.map(intervalToDto) };
}
