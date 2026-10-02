import { describe, expect, it } from "vitest";
import { driver, FakeProvider, session } from "@/shared/testing/fake-provider";
import { UpstreamError } from "@/shared/http/json-client";
import { RoutingF1DataProvider } from "./routing-f1-data-provider";

const quiet = { warn: () => {}, info: () => {} };
// FP1 04:30-05:30 UTC -> recording window 04:15-06:00
const FP1 = session({ session_key: 100 });
const during = () => new Date("2026-10-02T05:00:00Z");
const nextWeek = () => new Date("2026-10-09T00:00:00Z");

function setup(clock: () => Date) {
  const selfHosted = new FakeProvider({ sessions: [FP1] });
  const publicApi = new FakeProvider({ sessions: [FP1] });
  const router = new RoutingF1DataProvider(selfHosted, publicApi, clock, quiet);
  return { selfHosted, publicApi, router };
}

describe("RoutingF1DataProvider", () => {
  it("serves the schedule from self-hosted when it has it", async () => {
    const { router, publicApi } = setup(nextWeek);
    expect(await router.listSessions({ year: 2026 })).toEqual([FP1]);
    expect(publicApi.calls).toEqual([]);
  });

  it("falls back to public for the schedule when self-hosted is empty or down", async () => {
    const { router, selfHosted, publicApi } = setup(nextWeek);
    selfHosted.data.sessions = [];
    expect(await router.listSessions({ year: 2026 })).toEqual([FP1]);
    selfHosted.failWith = new Error("ECONNREFUSED");
    expect(await router.listSessions({ year: 2025 })).toEqual([]);
    expect(publicApi.calls).toHaveLength(2);
  });

  it("routes a live session to self-hosted", async () => {
    const { router, selfHosted, publicApi } = setup(during);
    selfHosted.data.drivers = [driver(100)];
    expect(await router.resolveRoute(100)).toEqual({ route: "self-hosted", live: true });
    expect(await router.listDrivers({ sessionKey: 100 })).toHaveLength(1);
    expect(publicApi.calls).toEqual([]);
  });

  it("routes a past session recorded locally to self-hosted", async () => {
    const { router, selfHosted } = setup(nextWeek);
    selfHosted.data.drivers = [driver(100)];
    expect(await router.resolveRoute(100)).toEqual({ route: "self-hosted", live: false });
  });

  it("routes a past session not recorded locally to public", async () => {
    const { router, publicApi } = setup(nextWeek);
    publicApi.data.drivers = [driver(100)];
    expect(await router.resolveRoute(100)).toEqual({ route: "public", live: false });
    expect(await router.listDrivers({ sessionKey: 100 })).toHaveLength(1);
  });

  it("falls back to public when self-hosted has no rows for the query", async () => {
    const { router, selfHosted, publicApi } = setup(nextWeek);
    selfHosted.data.drivers = [driver(100)]; // recorded, but no laps locally
    publicApi.data.laps = [
      {
        session_key: 100, meeting_key: 1, driver_number: 1, lap_number: 1,
        date_start: null, duration_sector_1: null, duration_sector_2: null,
        duration_sector_3: null, lap_duration: null, is_pit_out_lap: true,
      },
    ];
    expect(await router.listLaps({ sessionKey: 100 })).toHaveLength(1);
    expect(selfHosted.calls).toContain("laps 100");
    expect(publicApi.calls).toContain("laps 100");
  });

  it("returns the (empty) local answer while live if public is restricted", async () => {
    const { router, publicApi } = setup(during);
    publicApi.failWith = new UpstreamError("public", 401, "u", "Live F1 session in progress.");
    // listSessions for liveness goes to self-hosted first, so it still works.
    expect(await router.listLaps({ sessionKey: 100 })).toEqual([]);
  });
});

describe("RoutingF1DataProvider resilience", () => {
  it("keeps a locally stored session's empty answer when public fails", async () => {
    const { router, selfHosted, publicApi } = setup(nextWeek);
    selfHosted.data.drivers = [driver(100)]; // stored (e.g. backfilled), but no radio
    publicApi.failWith = new Error("ECONNRESET");
    expect(await router.listTeamRadio({ sessionKey: 100 })).toEqual([]);
  });

  it("remembers public's live restriction instead of asking again", async () => {
    let now = Date.parse("2026-10-09T00:00:00Z");
    const selfHosted = new FakeProvider({ sessions: [FP1] });
    const publicApi = new FakeProvider({ sessions: [FP1] });
    const router = new RoutingF1DataProvider(selfHosted, publicApi, () => new Date(now), quiet);
    publicApi.failWith = new UpstreamError("public", 401, "u", "Live F1 session in progress.");
    await expect(router.listLaps({ sessionKey: 100 })).rejects.toBeInstanceOf(UpstreamError);
    const calls = publicApi.calls.length;
    await expect(router.listLaps({ sessionKey: 100 })).rejects.toBeInstanceOf(UpstreamError);
    expect(publicApi.calls.length).toBe(calls);
    now += 61_000;
    await expect(router.listLaps({ sessionKey: 100 })).rejects.toBeInstanceOf(UpstreamError);
    expect(publicApi.calls.length).toBeGreaterThan(calls);
  });

  it("re-probes a session that was not stored (it may have been backfilled since)", async () => {
    let now = Date.parse("2026-10-09T00:00:00Z");
    const selfHosted = new FakeProvider({ sessions: [FP1] });
    const publicApi = new FakeProvider({ sessions: [FP1] });
    const router = new RoutingF1DataProvider(selfHosted, publicApi, () => new Date(now), quiet);
    expect((await router.resolveRoute(100)).route).toBe("public");
    selfHosted.data.drivers = [driver(100)];
    expect((await router.resolveRoute(100)).route).toBe("public"); // memoized
    now += 61_000;
    expect((await router.resolveRoute(100)).route).toBe("self-hosted");
  });
});
