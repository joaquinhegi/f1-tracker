import type { TrackOutline } from "../domain/track-outline";

/** Persistent cache of built outlines, keyed by circuit_key. */
export interface CircuitOutlineStore {
  get(circuitKey: number): Promise<TrackOutline | null>;
  save(outline: TrackOutline): Promise<void>;
}
