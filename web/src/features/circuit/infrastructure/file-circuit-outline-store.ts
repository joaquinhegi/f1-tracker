import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CircuitOutlineStore } from "../application/ports";
import type { TrackOutline } from "../domain/track-outline";

/**
 * Outlines in memory, backed by one JSON file per circuit under
 * `<cacheDir>/circuit-outlines/` so they survive restarts. A circuit layout
 * rarely changes; delete the file to force a rebuild.
 */
export class FileCircuitOutlineStore implements CircuitOutlineStore {
  private readonly memory = new Map<number, TrackOutline>();
  private readonly dir: string;

  constructor(cacheDir: string) {
    this.dir = path.join(cacheDir, "circuit-outlines");
  }

  private file(circuitKey: number): string {
    return path.join(this.dir, `${circuitKey}.json`);
  }

  async get(circuitKey: number): Promise<TrackOutline | null> {
    const hit = this.memory.get(circuitKey);
    if (hit) return hit;
    try {
      const parsed = JSON.parse(await readFile(this.file(circuitKey), "utf8")) as TrackOutline;
      if (parsed.circuitKey !== circuitKey || !Array.isArray(parsed.points) || !parsed.bounds) {
        return null;
      }
      this.memory.set(circuitKey, parsed);
      return parsed;
    } catch {
      return null; // missing or corrupt file: rebuild
    }
  }

  async save(outline: TrackOutline): Promise<void> {
    this.memory.set(outline.circuitKey, outline);
    try {
      await mkdir(this.dir, { recursive: true });
      const target = this.file(outline.circuitKey);
      const tmp = `${target}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(outline), "utf8");
      await rename(tmp, target);
    } catch (error) {
      console.warn(`[circuit] could not persist outline ${outline.circuitKey}`, error);
    }
  }
}
