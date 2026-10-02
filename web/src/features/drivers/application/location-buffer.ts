/**
 * Client-side store of car location samples, filled window by window.
 * Inserting a window replaces whatever the buffer held for that time range
 * (live windows are fetched again while they are still filling up).
 */
import { positionAt, sampleIndexAt, type LocationSample } from "../domain/car-position";
import type { Point } from "@/features/circuit/domain/geometry";

export class LocationBuffer {
  private readonly byDriver = new Map<number, LocationSample[]>();
  /** Time ranges [from, to) that were loaded, merged and sorted. */
  private ranges: Array<[number, number]> = [];

  insert(from: number, to: number, windowSamples: Map<number, LocationSample[]>): void {
    this.addRange(from, to);
    const drivers = new Set([...this.byDriver.keys(), ...windowSamples.keys()]);
    for (const driver of drivers) {
      const existing = this.byDriver.get(driver) ?? [];
      const incoming = (windowSamples.get(driver) ?? []).filter((s) => s.t >= from && s.t < to);
      const start = sampleIndexAt(existing, from - 1) + 1; // first sample >= from
      const end = sampleIndexAt(existing, to - 1) + 1; // first sample >= to
      const merged = [...existing.slice(0, start), ...incoming, ...existing.slice(end)];
      if (merged.length > 0) this.byDriver.set(driver, merged);
    }
  }

  private addRange(from: number, to: number): void {
    const all = [...this.ranges, [from, to] as [number, number]].sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [a, b] of all) {
      const last = merged.at(-1);
      if (last && a <= last[1]) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    this.ranges = merged;
  }

  /**
   * True when the window holding `t` was loaded: a driver without samples
   * there really has no position (garage), it is not just still loading.
   */
  covers(t: number): boolean {
    return this.ranges.some(([a, b]) => t >= a && t < b);
  }

  /** One driver's samples, sorted by time (empty when none). Do not mutate. */
  samplesOf(driver: number): readonly LocationSample[] {
    return this.byDriver.get(driver) ?? [];
  }

  positionAt(driver: number, t: number): Point | null {
    return positionAt(this.byDriver.get(driver) ?? [], t);
  }

  /** Drops samples outside [min, max] so a long replay never grows the buffer. */
  retain(min: number, max: number): void {
    this.ranges = this.ranges
      .map(([a, b]): [number, number] => [Math.max(a, min), Math.min(b, max)])
      .filter(([a, b]) => b > a);
    for (const [driver, samples] of this.byDriver) {
      const kept = samples.filter((s) => s.t >= min && s.t <= max);
      if (kept.length > 0) this.byDriver.set(driver, kept);
      else this.byDriver.delete(driver);
    }
  }

  sampleCount(): number {
    let n = 0;
    for (const samples of this.byDriver.values()) n += samples.length;
    return n;
  }
}
