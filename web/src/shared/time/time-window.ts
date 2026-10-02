/**
 * Time windows for chunked session data (car locations, intervals).
 *
 * Browsers only ask for windows aligned to WINDOW_ALIGN_MS and at most
 * MAX_WINDOW_MS long, so concurrent viewers of the same session hit the same
 * cache keys (one upstream request per window, shared by everyone) and no
 * client can make the BFF pull an arbitrarily large range.
 */

export const WINDOW_ALIGN_MS = 5_000;
export const MAX_WINDOW_MS = 120_000;

export interface TimeWindow {
  from: Date;
  to: Date;
}

/** Start of the `sizeMs` chunk containing `t` (epoch ms). */
export function chunkStart(t: number, sizeMs: number): number {
  return Math.floor(t / sizeMs) * sizeMs;
}

export type WindowParseResult = { ok: true; window: TimeWindow } | { ok: false; message: string };

export function parseTimeWindow(fromRaw: string | null, toRaw: string | null): WindowParseResult {
  if (!fromRaw || !toRaw) return { ok: false, message: "from and to are required ISO 8601 timestamps" };
  const from = Date.parse(fromRaw);
  const to = Date.parse(toRaw);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { ok: false, message: "from and to must be ISO 8601 timestamps" };
  }
  if (from % WINDOW_ALIGN_MS !== 0 || to % WINDOW_ALIGN_MS !== 0) {
    return { ok: false, message: `from and to must be multiples of ${WINDOW_ALIGN_MS / 1000} s` };
  }
  if (to <= from || to - from > MAX_WINDOW_MS) {
    return { ok: false, message: `to must be after from, at most ${MAX_WINDOW_MS / 1000} s later` };
  }
  return { ok: true, window: { from: new Date(from), to: new Date(to) } };
}
