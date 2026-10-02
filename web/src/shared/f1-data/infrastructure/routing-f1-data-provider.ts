import { isInRecordingWindow } from "@/shared/f1-data/domain/live-window";
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
import { UpstreamError } from "@/shared/http/json-client";
import { systemClock, type Clock } from "@/shared/time/clock";

export type Logger = Pick<Console, "warn" | "info">;

type Route = "self-hosted" | "public";

/** How long a "live session in progress" 401 from public OpenF1 is trusted without asking again. */
const RESTRICTION_MEMO_MS = 60_000;
/** Local presence probe: a stored session stays stored; a missing one may be backfilled any minute. */
const STORED_MEMO_MS = 10 * 60_000;
const NOT_STORED_MEMO_MS = 60_000;

/**
 * Composite F1DataProvider implementing the routing rule:
 *
 * - Schedule (meetings, sessions): self-hosted first (it has the current
 *   season synced and keeps answering while public OpenF1 is restricted
 *   during live sessions), public if it is empty or unreachable.
 * - Session data: self-hosted when the session is live (inside the
 *   recorder's window) or present locally (recorded live or backfilled from
 *   the static archive); otherwise public.
 *   For a locally served session, an empty local answer is completed from
 *   public when possible, but if public fails the local answer stands: it is
 *   the best data there is (and public 401s during any live session).
 * - A live-session restriction from public is remembered for a minute so
 *   polling clients do not keep spending the public rate limit on 401s.
 */
export class RoutingF1DataProvider implements F1DataProvider {
  private restrictedUntil = 0;
  private restriction: UpstreamError | null = null;
  private readonly stored = new Map<number, { value: boolean; until: number }>();

  constructor(
    private readonly selfHosted: F1DataProvider,
    private readonly publicApi: F1DataProvider,
    private readonly clock: Clock = systemClock,
    private readonly logger: Logger = console,
  ) {}

  listMeetings(filter: { year: number }): Promise<OpenF1Meeting[]> {
    return this.selfHostedFirst("meetings", (p) => p.listMeetings(filter));
  }

  listSessions(filter: SessionFilter): Promise<OpenF1Session[]> {
    return this.selfHostedFirst("sessions", (p) => p.listSessions(filter));
  }

  listLaps(filter: LapFilter, options?: QueryOptions): Promise<OpenF1Lap[]> {
    return this.sessionScoped(filter.sessionKey, options, (p, o) => p.listLaps(filter, o));
  }

  listLocations(filter: LocationFilter, options?: QueryOptions): Promise<OpenF1Location[]> {
    return this.sessionScoped(filter.sessionKey, options, (p, o) => p.listLocations(filter, o));
  }

  listDrivers(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Driver[]> {
    return this.sessionScoped(filter.sessionKey, options, (p, o) => p.listDrivers(filter, o));
  }

  listIntervals(filter: TimeWindowFilter, options?: QueryOptions): Promise<OpenF1Interval[]> {
    return this.sessionScoped(filter.sessionKey, options, (p, o) => p.listIntervals(filter, o));
  }

  listPositions(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Position[]> {
    return this.sessionScoped(filter.sessionKey, options, (p, o) => p.listPositions(filter, o));
  }

  listStints(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Stint[]> {
    return this.sessionScoped(filter.sessionKey, options, (p, o) => p.listStints(filter, o));
  }

  listPits(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1Pit[]> {
    return this.sessionScoped(filter.sessionKey, options, (p, o) => p.listPits(filter, o));
  }

  listTeamRadio(filter: { sessionKey: number }, options?: QueryOptions): Promise<OpenF1TeamRadio[]> {
    return this.sessionScoped(filter.sessionKey, options, (p, o) => p.listTeamRadio(filter, o));
  }

  /** Which upstream serves data for this session, and whether it is live. */
  async resolveRoute(sessionKey: number): Promise<{ route: Route; live: boolean }> {
    const live = await this.isLive(sessionKey);
    if (live) return { route: "self-hosted", live };
    return { route: (await this.isStoredLocally(sessionKey)) ? "self-hosted" : "public", live };
  }

  private async sessionScoped<T>(
    sessionKey: number,
    options: QueryOptions | undefined,
    query: (provider: F1DataProvider, options: QueryOptions) => Promise<T[]>,
  ): Promise<T[]> {
    const { route, live } = await this.resolveRoute(sessionKey);
    const effective: QueryOptions = { freshness: live ? "live" : "historical", ...options };

    if (route === "public") return this.askPublic(() => query(this.publicApi, effective));

    let local: T[] = [];
    try {
      local = await query(this.selfHosted, effective);
      if (local.length > 0) return local;
    } catch (error) {
      this.logger.warn(`[f1-data] self-hosted failed for session ${sessionKey}, using public`, error);
    }
    try {
      return await this.askPublic(() => query(this.publicApi, effective));
    } catch {
      // The session is served locally: its (empty) local answer is the truth.
      return local;
    }
  }

  /** Public call that short-circuits while public OpenF1 is known to be restricted. */
  private async askPublic<T>(call: () => Promise<T>): Promise<T> {
    if (this.restriction && this.clock().getTime() < this.restrictedUntil) throw this.restriction;
    try {
      return await call();
    } catch (error) {
      if (error instanceof UpstreamError && error.isLiveRestriction) {
        this.restriction = error;
        this.restrictedUntil = this.clock().getTime() + RESTRICTION_MEMO_MS;
      }
      throw error;
    }
  }

  private async isLive(sessionKey: number): Promise<boolean> {
    const [session] = await this.listSessions({ sessionKey });
    if (!session) return false;
    return isInRecordingWindow(
      {
        sessionName: session.session_name,
        sessionType: session.session_type,
        start: new Date(session.date_start),
        end: new Date(session.date_end),
        isCancelled: session.is_cancelled,
      },
      this.clock(),
    );
  }

  /**
   * Stored sessions (recorded live or backfilled) always have a driver list;
   * one cached local probe per session.
   */
  private async isStoredLocally(sessionKey: number): Promise<boolean> {
    const now = this.clock().getTime();
    const memo = this.stored.get(sessionKey);
    if (memo && now < memo.until) return memo.value;
    let value = false;
    try {
      // "live" = short upstream cache, so the memo below decides how long an answer holds.
      value = (await this.selfHosted.listDrivers({ sessionKey }, { freshness: "live" })).length > 0;
    } catch {
      value = false;
    }
    if (this.stored.size > 500) this.stored.clear();
    this.stored.set(sessionKey, { value, until: now + (value ? STORED_MEMO_MS : NOT_STORED_MEMO_MS) });
    return value;
  }

  private async selfHostedFirst<T>(
    what: string,
    query: (provider: F1DataProvider) => Promise<T[]>,
  ): Promise<T[]> {
    try {
      const local = await query(this.selfHosted);
      if (local.length > 0) return local;
    } catch (error) {
      this.logger.warn(`[f1-data] self-hosted ${what} unavailable, using public`, error);
    }
    return this.askPublic(() => query(this.publicApi));
  }
}
