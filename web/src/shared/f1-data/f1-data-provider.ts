/**
 * Port: read access to F1 data in OpenF1's published shape.
 *
 * Records keep OpenF1's snake_case field names on purpose: they are the
 * upstream contract (verified against real responses), and each feature maps
 * them into its own domain model in its application layer.
 */

export interface OpenF1Meeting {
  meeting_key: number;
  meeting_name: string;
  meeting_official_name: string;
  location: string;
  country_key: number;
  country_code: string;
  country_name: string;
  country_flag?: string | null;
  circuit_key: number;
  circuit_short_name: string;
  circuit_type?: string | null;
  circuit_image?: string | null;
  gmt_offset: string; // "08:00:00", "-05:00:00"
  date_start: string; // ISO 8601 with offset
  date_end?: string | null;
  year: number;
  is_cancelled?: boolean;
}

export interface OpenF1Session {
  session_key: number;
  session_type: string; // "Practice" | "Qualifying" | "Race"
  session_name: string; // "Practice 1" | "Sprint Qualifying" | "Sprint" | ...
  date_start: string;
  date_end: string;
  meeting_key: number;
  circuit_key: number;
  circuit_short_name: string;
  country_code: string;
  country_name: string;
  location: string;
  gmt_offset: string;
  year: number;
  is_cancelled?: boolean;
}

export interface OpenF1Lap {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  lap_number: number;
  date_start: string | null;
  duration_sector_1: number | null;
  duration_sector_2: number | null;
  duration_sector_3: number | null;
  lap_duration: number | null;
  is_pit_out_lap: boolean;
}

export interface OpenF1Location {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  x: number;
  y: number;
  z: number;
}

export interface OpenF1Driver {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  broadcast_name: string;
  full_name: string;
  name_acronym: string;
  team_name: string | null;
  team_colour: string | null; // hex without '#'
  headshot_url: string | null;
}

/** `gap_to_leader` / `interval`: seconds, "+1 LAP" style strings, or null. */
export type OpenF1GapValue = number | string | null;

export interface OpenF1Interval {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  gap_to_leader: OpenF1GapValue;
  interval: OpenF1GapValue;
}

export interface OpenF1Position {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  position: number;
}

export interface OpenF1Stint {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  stint_number: number;
  lap_start: number | null;
  lap_end: number | null;
  compound: string | null; // "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET" | "UNKNOWN"
  tyre_age_at_start: number | null;
}

export interface OpenF1Pit {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  /** The lap the car entered the pit lane on (its in-lap). */
  lap_number: number;
  pit_duration: number | null;
}

export interface OpenF1TeamRadio {
  session_key: number;
  meeting_key: number;
  driver_number: number;
  date: string;
  recording_url: string;
}

export interface SessionFilter {
  year?: number;
  meetingKey?: number;
  circuitKey?: number;
  sessionKey?: number;
}

export interface LapFilter {
  sessionKey: number;
  driverNumber?: number;
}

export interface LocationFilter {
  sessionKey: number;
  /** All drivers when omitted (one upstream call for the whole field). */
  driverNumber?: number;
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

export interface TimeWindowFilter {
  sessionKey: number;
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
}

/** How fresh an upstream answer must be: live data changes every second. */
export type Freshness = "live" | "historical";

export interface QueryOptions {
  /** Defaults to "historical" (long cache TTL). */
  freshness?: Freshness;
}

export interface F1DataProvider {
  listMeetings(filter: { year: number }): Promise<OpenF1Meeting[]>;
  listSessions(filter: SessionFilter): Promise<OpenF1Session[]>;
  listLaps(filter: LapFilter, options?: QueryOptions): Promise<OpenF1Lap[]>;
  listLocations(filter: LocationFilter, options?: QueryOptions): Promise<OpenF1Location[]>;
  listDrivers(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Driver[]>;
  listIntervals(filter: TimeWindowFilter, options?: QueryOptions): Promise<OpenF1Interval[]>;
  listPositions(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Position[]>;
  listStints(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Stint[]>;
  listPits(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Pit[]>;
  listTeamRadio(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1TeamRadio[]>;
}
