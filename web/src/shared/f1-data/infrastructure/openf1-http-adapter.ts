import type {
  F1DataProvider,
  LapFilter,
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
  QueryOptions,
  SessionFilter,
  TimeWindowFilter,
} from "@/shared/f1-data/f1-data-provider";
import type { JsonClient } from "@/shared/http/json-client";

export interface CacheTtls {
  scheduleMs: number;
  historicalMs: number;
  liveMs: number;
}

export const DEFAULT_TTLS: CacheTtls = {
  scheduleMs: 10 * 60_000,
  historicalMs: 60 * 60_000,
  liveMs: 2_000,
};

/** OpenF1 wants naive UTC timestamps in date filters: 2026-10-02T08:03:28.326 */
export function toOpenF1Date(date: Date): string {
  return date.toISOString().replace(/Z$/, "");
}

/**
 * Both the self-hosted and the public API are the same OpenF1 query API
 * (`/v1/<collection>`), so one HTTP adapter serves both; they differ in base
 * URL, rate limits and data coverage.
 */
export class OpenF1HttpAdapter implements F1DataProvider {
  constructor(
    protected readonly client: JsonClient,
    protected readonly ttls: CacheTtls = DEFAULT_TTLS,
  ) {}

  get name(): string {
    return this.client.name;
  }

  private ttl(options?: QueryOptions): number {
    return options?.freshness === "live" ? this.ttls.liveMs : this.ttls.historicalMs;
  }

  listMeetings({ year }: { year: number }): Promise<OpenF1Meeting[]> {
    return this.client.getJson("/v1/meetings", [["year", year]], this.ttls.scheduleMs);
  }

  listSessions(filter: SessionFilter): Promise<OpenF1Session[]> {
    return this.client.getJson(
      "/v1/sessions",
      [
        ["year", filter.year],
        ["meeting_key", filter.meetingKey],
        ["circuit_key", filter.circuitKey],
        ["session_key", filter.sessionKey],
      ],
      this.ttls.scheduleMs,
    );
  }

  listLaps(filter: LapFilter, options?: QueryOptions): Promise<OpenF1Lap[]> {
    return this.client.getJson(
      "/v1/laps",
      [
        ["session_key", filter.sessionKey],
        ["driver_number", filter.driverNumber],
      ],
      this.ttl(options),
    );
  }

  listLocations(filter: LocationFilter, options?: QueryOptions): Promise<OpenF1Location[]> {
    return this.client.getJson(
      "/v1/location",
      [
        ["session_key", filter.sessionKey],
        ["driver_number", filter.driverNumber],
        ["date>=", toOpenF1Date(filter.from)],
        ["date<", toOpenF1Date(filter.to)],
      ],
      this.ttl(options),
    );
  }

  listDrivers({ sessionKey }: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Driver[]> {
    return this.client.getJson("/v1/drivers", [["session_key", sessionKey]], this.ttl(options));
  }

  listIntervals(filter: TimeWindowFilter, options?: QueryOptions): Promise<OpenF1Interval[]> {
    return this.client.getJson(
      "/v1/intervals",
      [
        ["session_key", filter.sessionKey],
        ["date>=", toOpenF1Date(filter.from)],
        ["date<", toOpenF1Date(filter.to)],
      ],
      this.ttl(options),
    );
  }

  listPositions({ sessionKey }: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Position[]> {
    return this.client.getJson("/v1/position", [["session_key", sessionKey]], this.ttl(options));
  }

  listStints({ sessionKey }: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Stint[]> {
    return this.client.getJson("/v1/stints", [["session_key", sessionKey]], this.ttl(options));
  }

  listPits({ sessionKey }: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Pit[]> {
    return this.client.getJson("/v1/pit", [["session_key", sessionKey]], this.ttl(options));
  }

  listTeamRadio({ sessionKey }: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1TeamRadio[]> {
    return this.client.getJson("/v1/team_radio", [["session_key", sessionKey]], this.ttl(options));
  }
}

/** Self-hosted OpenF1 (infra/): live recordings + locally synced schedule. */
export class SelfHostedOpenF1Adapter extends OpenF1HttpAdapter {}

/** Public api.openf1.org: free historical data since 2023, restricted while a session is live. */
export class PublicOpenF1Adapter extends OpenF1HttpAdapter {}
