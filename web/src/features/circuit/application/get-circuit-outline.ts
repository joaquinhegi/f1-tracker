import type { F1DataProvider, OpenF1Lap, OpenF1Location, OpenF1Session } from "@/shared/f1-data/f1-data-provider";
import type { Clock } from "@/shared/time/clock";
import { buildPitLane, type PitLane } from "../domain/pit-lane";
import { isCleanLap, pitStopWindows, referenceLapWindows, type LapTiming } from "../domain/reference-lap";
import { buildTrackOutline, type TrackOutline } from "../domain/track-outline";
import { deriveTrackSectors, type TrackSectors } from "../domain/track-sectors";
import type { CircuitOutlineStore } from "./ports";

/** OpenF1 history starts in 2023. */
export const FIRST_DATA_YEAR = 2023;
const MAX_SESSIONS_TRIED = 3;
const MAX_LAPS_TRIED_PER_SESSION = 2;
/** Pit stops whose trace is tried per session when deriving the pit lane. */
const MAX_PIT_STOPS_TRIED_PER_SESSION = 4;

export class OutlineUnavailableError extends Error {
  constructor(
    readonly circuitKey: number,
    readonly reason: string,
  ) {
    super(`No outline for circuit ${circuitKey}: ${reason}`);
    this.name = "OutlineUnavailableError";
  }
}

export interface CircuitOutlineDeps {
  provider: F1DataProvider;
  store: CircuitOutlineStore;
  clock: Clock;
}

function lapFromOpenF1(lap: OpenF1Lap): LapTiming {
  return {
    driverNumber: lap.driver_number,
    lapNumber: lap.lap_number,
    start: lap.date_start ? new Date(lap.date_start) : null,
    durationSeconds: lap.lap_duration,
    sectorSeconds: [lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3],
    isPitOutLap: lap.is_pit_out_lap,
  };
}

/**
 * Finished sessions at the circuit, newest first, searching back one season
 * at a time (so the current season comes from the self-hosted schedule and
 * older ones from public OpenF1).
 */
async function finishedSessionsAt(
  provider: F1DataProvider,
  circuitKey: number,
  now: Date,
): Promise<OpenF1Session[]> {
  for (let year = now.getUTCFullYear(); year >= FIRST_DATA_YEAR; year--) {
    const sessions = await provider.listSessions({ circuitKey, year });
    const finished = sessions
      .filter((s) => !s.is_cancelled && new Date(s.date_end).getTime() < now.getTime())
      .sort((a, b) => new Date(b.date_start).getTime() - new Date(a.date_start).getTime());
    if (finished.length > 0) return finished;
  }
  return [];
}

function timedSamples(rows: readonly OpenF1Location[]) {
  return rows.map((r) => ({ t: Date.parse(r.date), x: r.x, y: r.y })).sort((a, b) => a.t - b.t);
}

/** Sector boundaries of an outline from its source lap's trace and sector times. */
function sectorsFromTrace(rows: readonly OpenF1Location[], lap: LapTiming | undefined, outline: TrackOutline): TrackSectors | null {
  if (!lap || !isCleanLap(lap)) return null;
  const [s1, s2, s3] = lap.sectorSeconds as [number, number, number];
  return deriveTrackSectors(timedSamples(rows), { startMs: lap.start!.getTime(), sectorSeconds: [s1, s2, s3] }, outline.points);
}

function findLap(laps: readonly LapTiming[], driverNumber: number, lapNumber: number): LapTiming | undefined {
  return laps.find((l) => l.driverNumber === driverNumber && l.lapNumber === lapNumber);
}

async function buildFromSession(
  provider: F1DataProvider,
  circuitKey: number,
  session: OpenF1Session,
  now: Date,
): Promise<TrackOutline | null> {
  const laps = (await provider.listLaps({ sessionKey: session.session_key })).map(lapFromOpenF1);
  for (const lap of referenceLapWindows(laps, MAX_LAPS_TRIED_PER_SESSION)) {
    const samples = await provider.listLocations({
      sessionKey: session.session_key,
      driverNumber: lap.driverNumber,
      from: lap.from,
      to: lap.to,
    });
    const outline = buildTrackOutline(circuitKey, samples, {
      sessionKey: session.session_key,
      sessionName: session.session_name,
      year: session.year,
      driverNumber: lap.driverNumber,
      lapNumber: lap.lapNumber,
    }, now);
    if (outline) return { ...outline, sectors: sectorsFromTrace(samples, findLap(laps, lap.driverNumber, lap.lapNumber), outline) };
  }
  return null;
}

/**
 * Sector boundaries for an outline cached before sectors existed, from its
 * own source lap (same trace, same frame). A provider failure leaves them
 * undefined (retried on a later request) instead of caching "no sectors".
 */
async function withSectors(provider: F1DataProvider, outline: TrackOutline): Promise<TrackOutline> {
  const { sessionKey, driverNumber, lapNumber } = outline.source;
  try {
    const laps = (await provider.listLaps({ sessionKey, driverNumber })).map(lapFromOpenF1);
    const lap = findLap(laps, driverNumber, lapNumber);
    if (!lap || !isCleanLap(lap)) return { ...outline, sectors: null };
    const rows = await provider.listLocations({
      sessionKey,
      driverNumber,
      from: lap.start!,
      to: new Date(lap.start!.getTime() + lap.durationSeconds! * 1000),
    });
    return { ...outline, sectors: sectorsFromTrace(rows, lap, outline) };
  } catch (error) {
    console.warn(`[circuit] sectors of circuit ${outline.circuitKey} unavailable for now`, error);
    return outline;
  }
}

async function pitLaneFromSession(provider: F1DataProvider, outline: TrackOutline, session: OpenF1Session): Promise<PitLane | null> {
  const laps = (await provider.listLaps({ sessionKey: session.session_key })).map(lapFromOpenF1);
  for (const stop of pitStopWindows(laps, MAX_PIT_STOPS_TRIED_PER_SESSION)) {
    const rows = await provider.listLocations({
      sessionKey: session.session_key,
      driverNumber: stop.driverNumber,
      from: stop.from,
      to: stop.to,
    });
    const lane = buildPitLane(timedSamples(rows), outline.points, {
      sessionKey: session.session_key,
      driverNumber: stop.driverNumber,
      lapNumber: stop.lapNumber,
    });
    if (lane) return lane;
  }
  return null;
}

/**
 * The pit lane in the outline's frame, traced from a pit stop: the outline's
 * own session first, then the other recent sessions at the circuit.
 */
async function derivePitLane(
  provider: F1DataProvider,
  outline: TrackOutline,
  sessions: readonly OpenF1Session[],
): Promise<PitLane | null> {
  const ordered = [
    ...sessions.filter((s) => s.session_key === outline.source.sessionKey),
    ...sessions.filter((s) => s.session_key !== outline.source.sessionKey),
  ].slice(0, MAX_SESSIONS_TRIED);
  for (const session of ordered) {
    const lane = await pitLaneFromSession(provider, outline, session);
    if (lane) return lane;
  }
  return null;
}

/**
 * Adds the pit lane to an outline. A provider failure leaves it undefined
 * (retried on a later request) instead of caching "no pit lane".
 */
async function withPitLane(
  provider: F1DataProvider,
  outline: TrackOutline,
  sessions: readonly OpenF1Session[],
): Promise<TrackOutline> {
  try {
    return { ...outline, pitLane: await derivePitLane(provider, outline, sessions) };
  } catch (error) {
    console.warn(`[circuit] pit lane of circuit ${outline.circuitKey} unavailable for now`, error);
    return outline; // keeps the track; only the pit lane is retried
  }
}

/** Fills in whatever the outline still lacks (sectors, pit lane) and caches the result. */
async function complete(
  outline: TrackOutline,
  { provider, store }: CircuitOutlineDeps,
  sessions: () => Promise<readonly OpenF1Session[]>,
): Promise<TrackOutline> {
  let result = outline;
  if (result.sectors === undefined) result = await withSectors(provider, result);
  if (result.pitLane === undefined) result = await withPitLane(provider, result, await sessions());
  await store.save(result);
  return result;
}

const isComplete = (outline: TrackOutline) => outline.pitLane !== undefined && outline.sectors !== undefined;

/**
 * Use case: the outline of a circuit, built once from the location trace of
 * one clean lap of the most recent finished session there, split into its
 * three sectors by that lap's sector times, plus its pit lane traced from a
 * pit stop, then cached.
 */
export async function getCircuitOutline(circuitKey: number, deps: CircuitOutlineDeps): Promise<TrackOutline> {
  const { provider, store, clock } = deps;
  const cached = await store.get(circuitKey);
  if (cached && isComplete(cached)) return cached;

  const now = clock();
  if (cached) {
    // Cached before pit lanes or sectors existed: only those are missing.
    return complete(cached, deps, () => finishedSessionsAt(provider, circuitKey, now).catch(() => []));
  }
  const sessions = await finishedSessionsAt(provider, circuitKey, now);
  if (sessions.length === 0) {
    throw new OutlineUnavailableError(circuitKey, "no finished session at this circuit since 2023");
  }

  for (const session of sessions.slice(0, MAX_SESSIONS_TRIED)) {
    const outline = await buildFromSession(provider, circuitKey, session, now);
    if (outline) return complete(outline, deps, async () => sessions);
  }
  throw new OutlineUnavailableError(
    circuitKey,
    `no clean lap with location data in the last ${Math.min(sessions.length, MAX_SESSIONS_TRIED)} sessions`,
  );
}
