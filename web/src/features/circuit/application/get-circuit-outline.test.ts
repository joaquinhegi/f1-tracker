import { describe, expect, it } from "vitest";
import type { OpenF1Lap, OpenF1Location } from "@/shared/f1-data/f1-data-provider";
import { FakeProvider, session } from "@/shared/testing/fake-provider";
import type { TrackOutline } from "../domain/track-outline";
import { outlineToDto } from "./circuit-outline-dto";
import { getCircuitOutline, OutlineUnavailableError } from "./get-circuit-outline";
import type { CircuitOutlineStore } from "./ports";

class MemoryStore implements CircuitOutlineStore {
  saved: TrackOutline[] = [];
  async get(key: number) {
    return this.saved.find((o) => o.circuitKey === key) ?? null;
  }
  async save(o: TrackOutline) {
    this.saved.push(o);
  }
}

const LAP_START = "2025-09-05T10:00:00.000Z";

function lap(sessionKey: number, overrides: Partial<OpenF1Lap> = {}): OpenF1Lap {
  return {
    session_key: sessionKey, meeting_key: 1, driver_number: 1, lap_number: 2, date_start: LAP_START,
    duration_sector_1: 26, duration_sector_2: 27, duration_sector_3: 27, lap_duration: 80,
    is_pit_out_lap: false, ...overrides,
  };
}

/** 80 s lap at ~3.7 Hz on a circle. */
function trace(sessionKey: number, driver = 1): OpenF1Location[] {
  const n = 296;
  return Array.from({ length: n }, (_, i) => ({
    session_key: sessionKey, meeting_key: 1, driver_number: driver,
    date: new Date(Date.parse(LAP_START) + (i * 80_000) / n).toISOString(),
    x: Math.round(3000 * Math.cos((2 * Math.PI * i) / n)),
    y: Math.round(2000 * Math.sin((2 * Math.PI * i) / n)),
    z: 0,
  }));
}

const now = () => new Date("2026-09-01T00:00:00Z");
const MONZA_2025 = session({
  session_key: 500, circuit_key: 39, year: 2025, session_name: "Qualifying",
  date_start: "2025-09-05T09:00:00+00:00", date_end: "2025-09-05T11:00:00+00:00",
});
const MONZA_2026_UPCOMING = session({
  session_key: 600, circuit_key: 39, year: 2026,
  date_start: "2026-09-04T10:30:00+00:00", date_end: "2026-09-04T11:30:00+00:00",
});

describe("getCircuitOutline", () => {
  it("uses the most recent finished session at the circuit when the weekend has no data yet", async () => {
    const provider = new FakeProvider({
      sessions: [MONZA_2026_UPCOMING, MONZA_2025],
      laps: [lap(500)],
      locations: trace(500),
    });
    const store = new MemoryStore();

    const outline = await getCircuitOutline(39, { provider, store, clock: now });

    expect(outline.source).toEqual({ sessionKey: 500, sessionName: "Qualifying", year: 2025, driverNumber: 1, lapNumber: 2 });
    expect(provider.calls).toContain('sessions {"circuitKey":39,"year":2026}');
    expect(provider.calls).toContain('sessions {"circuitKey":39,"year":2025}');
    expect(store.saved).toHaveLength(1);
  });

  it("serves the cached outline without touching the provider", async () => {
    const provider = new FakeProvider({ sessions: [MONZA_2025], laps: [lap(500)], locations: trace(500) });
    const store = new MemoryStore();
    await getCircuitOutline(39, { provider, store, clock: now });
    provider.calls.length = 0;

    await getCircuitOutline(39, { provider, store, clock: now });
    expect(provider.calls).toEqual([]);
  });

  it("tries the next lap when the fastest one has no location data", async () => {
    const provider = new FakeProvider({
      sessions: [MONZA_2025],
      laps: [lap(500, { driver_number: 44, lap_duration: 79 }), lap(500)],
      locations: trace(500, 1),
    });
    const outline = await getCircuitOutline(39, { provider, store: new MemoryStore(), clock: now });
    expect(outline.source.driverNumber).toBe(1);
  });

  it("fails with a reason when the circuit has no history", async () => {
    const provider = new FakeProvider({ sessions: [MONZA_2026_UPCOMING] });
    await expect(getCircuitOutline(39, { provider, store: new MemoryStore(), clock: now })).rejects.toBeInstanceOf(
      OutlineUnavailableError,
    );
  });

  it("serializes to a DTO whose path and start/finish are in SVG space", async () => {
    const provider = new FakeProvider({ sessions: [MONZA_2025], laps: [lap(500)], locations: trace(500) });
    const dto = outlineToDto(await getCircuitOutline(39, { provider, store: new MemoryStore(), clock: now }));
    expect(dto.viewBox).toMatch(/^0 0 1000 \d+/);
    expect(dto.path.startsWith("M")).toBe(true);
    expect(dto.path.endsWith("Z")).toBe(true);
    // Lap starts at (3000, 0): the right-most point, vertically centred.
    expect(dto.startFinish!.point.x).toBeCloseTo(960, 0);
    // Raw direction is +y (counter-clockwise); on screen that is upwards (-y).
    expect(dto.startFinish!.direction.y).toBeLessThan(0);
  });

  describe("sectors", () => {
    it("splits the outline at the source lap's sector times and caches the boundaries", async () => {
      const provider = new FakeProvider({ sessions: [MONZA_2025], laps: [lap(500, { duration_sector_1: 20, duration_sector_2: 30, duration_sector_3: 30 })], locations: trace(500) });
      const store = new MemoryStore();
      const outline = await getCircuitOutline(39, { provider, store, clock: now });
      const [b1, b2] = outline.sectors!.boundaries;
      expect(b1.along / outline.sectors!.length).toBeCloseTo(0.25, 1);
      expect(b2.along / outline.sectors!.length).toBeCloseTo(0.625, 1);
      expect(store.saved.at(-1)?.sectors).toEqual(outline.sectors);

      const dto = outlineToDto(outline);
      expect(dto.sectors!.paths).toHaveLength(3);
      expect(dto.sectors!.paths.every((p) => p.startsWith("M") && !p.endsWith("Z"))).toBe(true);
      expect(dto.sectors!.boundaries[0].share).toBeCloseTo(0.25, 1);
    });

    it("adds the sectors to an outline cached before sectors existed, from its own source lap", async () => {
      const provider = new FakeProvider({ sessions: [MONZA_2025], laps: [lap(500)], locations: trace(500) });
      const store = new MemoryStore();
      const first = await getCircuitOutline(39, { provider, store, clock: now });
      const legacy = { ...first };
      delete legacy.sectors;
      store.saved = [legacy];
      provider.calls.length = 0;
      const upgraded = await getCircuitOutline(39, { provider, store, clock: now });
      expect(upgraded.sectors).toEqual(first.sectors);
      expect(upgraded.pitLane).toEqual(first.pitLane);
      expect(provider.calls.some((c) => c.startsWith("sessions"))).toBe(false); // pit lane already known
    });

    it("caches 'no sectors' when the source lap has no sector times, so the track stays single-colour", async () => {
      const provider = new FakeProvider({ sessions: [MONZA_2025], laps: [lap(500)], locations: trace(500) });
      const store = new MemoryStore();
      const first = await getCircuitOutline(39, { provider, store, clock: now });
      const legacy = { ...first };
      delete legacy.sectors;
      store.saved = [legacy];
      provider.listLaps = async () => [lap(500, { duration_sector_2: null })];
      const upgraded = await getCircuitOutline(39, { provider, store, clock: now });
      expect(upgraded.sectors).toBeNull();
      expect(outlineToDto(upgraded).sectors).toBeNull();
    });
  });

  describe("pit lane", () => {
    const STOP_START = Date.parse("2025-09-05T10:10:00.000Z");

    /** Driver 2: on the racing line, into a lane 5% inside it, parked 60 s, back out. */
    function stopTrace(sessionKey: number): OpenF1Location[] {
      const rows: OpenF1Location[] = [];
      let t = STOP_START - 60_000;
      const at = (angle: number, inset: number) => {
        rows.push({
          session_key: sessionKey, meeting_key: 1, driver_number: 2, date: new Date(t).toISOString(),
          x: Math.round(3000 * (1 - inset) * Math.cos(angle)), y: Math.round(2000 * (1 - inset) * Math.sin(angle)), z: 0,
        });
        t += 270;
      };
      const ramp = (a: number) => (a < 0.5 ? 0 : a < 1 ? ((a - 0.5) / 0.5) * 0.05 : a < 2.5 ? 0.05 : a < 3 ? ((3 - a) / 0.5) * 0.05 : 0);
      for (let a = 0; a < 1.5; a += 0.01) at(a, ramp(a));
      for (let i = 0; i < 220; i++) at(1.5, 0.05);
      for (let a = 1.5; a < 3.5; a += 0.01) at(a, ramp(a));
      return rows;
    }

    const pitLaps = (sessionKey: number) => [
      lap(sessionKey),
      lap(sessionKey, { driver_number: 2, lap_number: 3, date_start: new Date(STOP_START - 60_000).toISOString(), lap_duration: 200 }),
      lap(sessionKey, { driver_number: 2, lap_number: 4, date_start: new Date(STOP_START + 70_000).toISOString(), is_pit_out_lap: true, lap_duration: 120 }),
    ];

    it("derives the pit lane from a pit stop of the outline's session and caches it", async () => {
      const provider = new FakeProvider({ sessions: [MONZA_2025], laps: pitLaps(500), locations: [...trace(500), ...stopTrace(500)] });
      const store = new MemoryStore();
      const outline = await getCircuitOutline(39, { provider, store, clock: now });
      expect(outline.pitLane?.source).toEqual({ sessionKey: 500, driverNumber: 2, lapNumber: 4 });
      expect(outline.pitLane!.points.length).toBeGreaterThan(2);
      expect(store.saved.at(-1)?.pitLane).toEqual(outline.pitLane);
      const dto = outlineToDto(outline);
      expect(dto.pitLane?.points).toEqual(outline.pitLane!.points);
    });

    it("adds the pit lane to an outline cached before pit lanes existed", async () => {
      const provider = new FakeProvider({ sessions: [MONZA_2025], laps: pitLaps(500), locations: [...trace(500), ...stopTrace(500)] });
      const store = new MemoryStore();
      const first = await getCircuitOutline(39, { provider, store, clock: now });
      const legacy = { ...first };
      delete legacy.pitLane;
      store.saved = [legacy];
      const upgraded = await getCircuitOutline(39, { provider, store, clock: now });
      expect(upgraded.points).toEqual(first.points);
      expect(upgraded.pitLane).toEqual(first.pitLane);
    });

    it("caches 'no pit lane' when no stop traces one, so cars park beside the start/finish line", async () => {
      const provider = new FakeProvider({ sessions: [MONZA_2025], laps: [lap(500)], locations: trace(500) });
      const outline = await getCircuitOutline(39, { provider, store: new MemoryStore(), clock: now });
      expect(outline.pitLane).toBeNull();
      expect(outlineToDto(outline).pitLane).toBeNull();
    });

    it("keeps the track and retries the pit lane later when the provider fails meanwhile", async () => {
      const provider = new FakeProvider({ sessions: [MONZA_2025], laps: pitLaps(500), locations: [...trace(500), ...stopTrace(500)] });
      const store = new MemoryStore();
      const original = provider.listLocations.bind(provider);
      let calls = 0;
      provider.listLocations = async (f) => {
        calls += 1;
        if (f.driverNumber === 2) throw new Error("upstream down");
        return original(f);
      };
      const outline = await getCircuitOutline(39, { provider, store, clock: now });
      expect(outline.points.length).toBeGreaterThan(0);
      expect(outline.pitLane).toBeUndefined();
      expect(calls).toBeGreaterThan(0);
      provider.listLocations = original;
      expect((await getCircuitOutline(39, { provider, store, clock: now })).pitLane).not.toBeUndefined();
    });
  });
});
