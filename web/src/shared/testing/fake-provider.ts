import type {
  F1DataProvider,
  LocationFilter,
  OpenF1Driver,
  OpenF1Interval,
  OpenF1Lap,
  OpenF1Location,
  OpenF1Meeting,
  OpenF1Pit,
  OpenF1Position,
  OpenF1Session,
  OpenF1Stint,
  OpenF1TeamRadio,
  SessionFilter,
  TimeWindowFilter,
} from "@/shared/f1-data/f1-data-provider";

export interface FakeData {
  meetings?: OpenF1Meeting[];
  sessions?: OpenF1Session[];
  laps?: OpenF1Lap[];
  locations?: OpenF1Location[];
  drivers?: OpenF1Driver[];
  intervals?: OpenF1Interval[];
  positions?: OpenF1Position[];
  stints?: OpenF1Stint[];
  pits?: OpenF1Pit[];
  teamRadio?: OpenF1TeamRadio[];
}

const inWindow = (date: string, from: Date, to: Date) => {
  const t = new Date(date).getTime();
  return t >= from.getTime() && t < to.getTime();
};

/** In-memory F1DataProvider that filters like OpenF1 and records calls. */
export class FakeProvider implements F1DataProvider {
  readonly calls: string[] = [];
  failWith: Error | null = null;

  constructor(public data: FakeData = {}) {}

  private record(call: string) {
    this.calls.push(call);
    if (this.failWith) throw this.failWith;
  }

  async listMeetings({ year }: { year: number }) {
    this.record(`meetings ${year}`);
    return (this.data.meetings ?? []).filter((m) => m.year === year);
  }

  async listSessions(f: SessionFilter) {
    this.record(`sessions ${JSON.stringify(f)}`);
    return (this.data.sessions ?? []).filter(
      (s) =>
        (f.year === undefined || s.year === f.year) &&
        (f.meetingKey === undefined || s.meeting_key === f.meetingKey) &&
        (f.circuitKey === undefined || s.circuit_key === f.circuitKey) &&
        (f.sessionKey === undefined || s.session_key === f.sessionKey),
    );
  }

  async listLaps({ sessionKey, driverNumber }: { sessionKey: number; driverNumber?: number }) {
    this.record(`laps ${sessionKey}`);
    return (this.data.laps ?? []).filter(
      (l) => l.session_key === sessionKey && (driverNumber === undefined || l.driver_number === driverNumber),
    );
  }

  async listLocations(f: LocationFilter) {
    this.record(`location ${f.sessionKey} #${f.driverNumber ?? "all"}`);
    return (this.data.locations ?? []).filter(
      (p) =>
        p.session_key === f.sessionKey &&
        (f.driverNumber === undefined || p.driver_number === f.driverNumber) &&
        inWindow(p.date, f.from, f.to),
    );
  }

  async listDrivers({ sessionKey }: { sessionKey: number }) {
    this.record(`drivers ${sessionKey}`);
    return (this.data.drivers ?? []).filter((d) => d.session_key === sessionKey);
  }

  async listIntervals(f: TimeWindowFilter) {
    this.record(`intervals ${f.sessionKey}`);
    return (this.data.intervals ?? []).filter((i) => i.session_key === f.sessionKey && inWindow(i.date, f.from, f.to));
  }

  async listPositions({ sessionKey }: { sessionKey: number }) {
    this.record(`positions ${sessionKey}`);
    return (this.data.positions ?? []).filter((p) => p.session_key === sessionKey);
  }

  async listStints({ sessionKey }: { sessionKey: number }) {
    this.record(`stints ${sessionKey}`);
    return (this.data.stints ?? []).filter((s) => s.session_key === sessionKey);
  }

  async listPits({ sessionKey }: { sessionKey: number }) {
    this.record(`pits ${sessionKey}`);
    return (this.data.pits ?? []).filter((p) => p.session_key === sessionKey);
  }

  async listTeamRadio({ sessionKey }: { sessionKey: number }) {
    this.record(`team_radio ${sessionKey}`);
    return (this.data.teamRadio ?? []).filter((r) => r.session_key === sessionKey);
  }
}

export function session(overrides: Partial<OpenF1Session> & Pick<OpenF1Session, "session_key">): OpenF1Session {
  return {
    session_type: "Practice",
    session_name: "Practice 1",
    date_start: "2026-10-02T04:30:00+00:00",
    date_end: "2026-10-02T05:30:00+00:00",
    meeting_key: 1,
    circuit_key: 12,
    circuit_short_name: "Kuala Lumpur",
    country_code: "BRN",
    country_name: "Bahrain",
    location: "Kuala Lumpur",
    gmt_offset: "08:00:00",
    year: 2026,
    is_cancelled: false,
    ...overrides,
  };
}

export function meeting(overrides: Partial<OpenF1Meeting> & Pick<OpenF1Meeting, "meeting_key">): OpenF1Meeting {
  return {
    meeting_name: "Test Grand Prix",
    meeting_official_name: "FORMULA 1 TEST GRAND PRIX 2026",
    location: "Somewhere",
    country_key: 1,
    country_code: "TST",
    country_name: "Testland",
    country_flag: null,
    circuit_key: 12,
    circuit_short_name: "Test Circuit",
    gmt_offset: "00:00:00",
    date_start: "2026-10-02T04:30:00+00:00",
    date_end: "2026-10-04T09:00:00+00:00",
    year: 2026,
    is_cancelled: false,
    ...overrides,
  };
}

export function driver(sessionKey: number, driverNumber = 1, overrides: Partial<OpenF1Driver> = {}): OpenF1Driver {
  return {
    session_key: sessionKey,
    meeting_key: 1,
    driver_number: driverNumber,
    broadcast_name: "L NORRIS",
    full_name: "Lando NORRIS",
    name_acronym: "NOR",
    team_name: "McLaren",
    team_colour: "F47600",
    headshot_url: null,
    ...overrides,
  };
}
