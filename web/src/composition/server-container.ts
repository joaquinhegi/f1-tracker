import "server-only";

import { getCircuitOutline } from "@/features/circuit/application/get-circuit-outline";
import { FileCircuitOutlineStore } from "@/features/circuit/infrastructure/file-circuit-outline-store";
import type { TrackOutline } from "@/features/circuit/domain/track-outline";
import { getLocationWindow } from "@/features/drivers/application/get-location-window";
import { getSessionDrivers } from "@/features/drivers/application/get-session-drivers";
import { getTeamRadio } from "@/features/radio/application/get-team-radio";
import { getIntervalWindow, getSessionTiming } from "@/features/timing/application/get-session-timing";
import { getWeekendOverview } from "@/features/weekend/application/get-weekend-overview";
import type { WeekendOverviewDto } from "@/features/weekend/application/weekend-dto";
import { TtlCache } from "@/shared/cache/ttl-cache";
import { readServerConfig } from "@/shared/config/server-config";
import { createF1DataProvider } from "@/shared/f1-data/infrastructure/create-f1-data-provider";
import { systemClock } from "@/shared/time/clock";
import type { TimeWindow } from "@/shared/time/time-window";

/** DTO memo TTLs: upstream answers are cached separately (JsonClient); this only spares re-mapping. */
const LIVE_DTO_TTL_MS = 1_000;
const HISTORICAL_DTO_TTL_MS = 5 * 60_000;

/**
 * Composition root: wires adapters into use cases once per server process.
 * Kept on globalThis so dev-mode module reloads do not create extra caches
 * and rate limiters (which would let us exceed upstream limits).
 */
function createContainer() {
  const config = readServerConfig();
  const provider = createF1DataProvider(config);
  const outlineStore = new FileCircuitOutlineStore(config.cacheDir);
  const memo = new TtlCache();

  /** Coalesces identical session-scoped requests from many browsers into one computation. */
  async function sessionScoped<T>(key: string, sessionKey: number, load: () => Promise<T>): Promise<{ value: T; live: boolean }> {
    const { live } = await provider.resolveRoute(sessionKey);
    const value = await memo.getOrLoad(`${key} ${sessionKey}`, live ? LIVE_DTO_TTL_MS : HISTORICAL_DTO_TTL_MS, load);
    return { value, live };
  }
  const windowKey = (w: TimeWindow) => `${w.from.getTime()}-${w.to.getTime()}`;

  return {
    provider,
    getSessionDrivers: (sessionKey: number) =>
      sessionScoped("drivers", sessionKey, () => getSessionDrivers(provider, sessionKey)),
    getSessionTiming: (sessionKey: number) =>
      sessionScoped("timing", sessionKey, () => getSessionTiming(provider, sessionKey)),
    getTeamRadio: (sessionKey: number) =>
      sessionScoped("team-radio", sessionKey, () => getTeamRadio(provider, sessionKey)),
    getLocationWindow: (sessionKey: number, window: TimeWindow) =>
      sessionScoped(`locations ${windowKey(window)}`, sessionKey, () => getLocationWindow(provider, sessionKey, window)),
    getIntervalWindow: (sessionKey: number, window: TimeWindow) =>
      sessionScoped(`intervals ${windowKey(window)}`, sessionKey, () => getIntervalWindow(provider, sessionKey, window)),
    /** Coalesced: concurrent page renders + API calls share one computation. */
    getWeekendOverview: (): Promise<WeekendOverviewDto> =>
      memo.getOrLoad("weekend-overview", 15_000, () => getWeekendOverview(provider, systemClock)),
    getCircuitOutline: (circuitKey: number): Promise<TrackOutline> =>
      memo.getOrLoad(`outline ${circuitKey}`, 60_000, () =>
        getCircuitOutline(circuitKey, { provider, store: outlineStore, clock: systemClock }),
      ),
  };
}

export type ServerContainer = ReturnType<typeof createContainer>;

const globalForContainer = globalThis as unknown as { __f1Container?: ServerContainer };

export function container(): ServerContainer {
  globalForContainer.__f1Container ??= createContainer();
  return globalForContainer.__f1Container;
}
