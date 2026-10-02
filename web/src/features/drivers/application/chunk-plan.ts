/**
 * Which location windows the car overlay needs, in fetch priority order.
 * Windows are aligned chunks (see shared/time/time-window) so every viewer
 * of a session asks for the same URLs and shares the BFF cache.
 */
import { chunkStart } from "@/shared/time/time-window";

/** Replay: one minute of data per request. */
export const REPLAY_CHUNK_MS = 60_000;
/** Live: small chunks, re-fetched while they are still filling up. */
export const LIVE_CHUNK_MS = 10_000;
/** A live chunk is final once its end is this far behind the wall clock. */
export const LIVE_SETTLE_MS = 15_000;

export interface ReplayPlanInput {
  playhead: number;
  rate: number;
  sessionStart: number;
  sessionEnd: number;
  chunkMs?: number;
}

/**
 * Chunk starts to have loaded for a replay: the current chunk, then enough
 * ahead for ~20 s of real time at the current speed (at least one chunk), then
 * the previous one (scrubbing back).
 */
export function replayChunks({ playhead, rate, sessionStart, sessionEnd, chunkMs = REPLAY_CHUNK_MS }: ReplayPlanInput): number[] {
  const first = chunkStart(sessionStart, chunkMs);
  const last = chunkStart(sessionEnd, chunkMs);
  const current = Math.min(Math.max(chunkStart(playhead, chunkMs), first), last);
  const ahead = Math.max(1, Math.ceil((rate * 20_000) / chunkMs));
  const plan = [current];
  for (let i = 1; i <= ahead; i++) plan.push(current + i * chunkMs);
  plan.push(current - chunkMs);
  return plan.filter((c) => c >= first && c <= last);
}

/** Live: the chunk under the (delayed) playhead and every chunk up to "now". */
export function liveChunks(playhead: number, now: number, chunkMs = LIVE_CHUNK_MS): number[] {
  const plan: number[] = [];
  for (let c = chunkStart(playhead - 2_000, chunkMs); c <= chunkStart(now, chunkMs); c += chunkMs) plan.push(c);
  return plan;
}

export function isLiveChunkSettled(chunk: number, now: number, chunkMs = LIVE_CHUNK_MS): boolean {
  return chunk + chunkMs <= now - LIVE_SETTLE_MS;
}
