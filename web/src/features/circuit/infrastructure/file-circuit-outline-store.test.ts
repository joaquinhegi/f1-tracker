import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TrackOutline } from "../domain/track-outline";
import { FileCircuitOutlineStore } from "./file-circuit-outline-store";

const outline: TrackOutline = {
  circuitKey: 12,
  points: [{ x: 1, y: 2 }],
  bounds: { minX: 1, minY: 2, maxX: 1, maxY: 2 },
  startFinish: null,
  source: { sessionKey: 1, sessionName: "Race", year: 2026, driverNumber: 1, lapNumber: 3 },
  builtAt: "2026-10-02T00:00:00.000Z",
};

describe("FileCircuitOutlineStore", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "outline-store-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("persists outlines as JSON files that survive a new instance", async () => {
    await new FileCircuitOutlineStore(dir).save(outline);
    const file = path.join(dir, "circuit-outlines", "12.json");
    expect(JSON.parse(await readFile(file, "utf8"))).toEqual(outline);
    expect(await new FileCircuitOutlineStore(dir).get(12)).toEqual(outline);
  });

  it("treats missing or corrupt files as a miss", async () => {
    const store = new FileCircuitOutlineStore(dir);
    expect(await store.get(99)).toBeNull();
    await store.save(outline);
    await writeFile(path.join(dir, "circuit-outlines", "12.json"), "{not json");
    expect(await new FileCircuitOutlineStore(dir).get(12)).toBeNull();
  });
});
