import { parseTimeWindow, type TimeWindow } from "@/shared/time/time-window";
import { errorResponse } from "../../_lib/error-response";

function badRequest(message: string): Response {
  return Response.json({ error: { code: "bad_request", message } }, { status: 400, headers: { "Cache-Control": "no-store" } });
}

export function parseSessionKey(raw: string): number | null {
  const key = Number(raw);
  return Number.isInteger(key) && key > 0 ? key : null;
}

/**
 * Browser cache policy. Live data changes every second (the BFF shares one
 * upstream request per second between all viewers anyway); a finished
 * session's data only changes if it gets backfilled, a finished window never.
 */
function cacheControl(live: boolean, immutable: boolean): string {
  if (live) return "public, max-age=1";
  return immutable ? "public, max-age=86400, immutable" : "public, max-age=300, stale-while-revalidate=3600";
}

type Loader = (sessionKey: number) => Promise<{ value: unknown; live: boolean }>;

/** GET handler body for /api/sessions/:sessionKey/<resource>. */
export async function sessionResponse(rawKey: string, load: Loader): Promise<Response> {
  const sessionKey = parseSessionKey(rawKey);
  if (sessionKey === null) return badRequest("sessionKey must be a positive integer");
  try {
    const { value, live } = await load(sessionKey);
    return Response.json(value, { headers: { "Cache-Control": cacheControl(live, false) } });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Same, for windowed resources (`?from=&to=`, see shared/time/time-window). */
export async function sessionWindowResponse(
  rawKey: string,
  request: Request,
  load: (sessionKey: number, window: TimeWindow) => Promise<{ value: unknown; live: boolean }>,
): Promise<Response> {
  const sessionKey = parseSessionKey(rawKey);
  if (sessionKey === null) return badRequest("sessionKey must be a positive integer");
  const { searchParams } = new URL(request.url);
  const parsed = parseTimeWindow(searchParams.get("from"), searchParams.get("to"));
  if (!parsed.ok) return badRequest(parsed.message);
  try {
    const { value, live } = await load(sessionKey, parsed.window);
    const settled = parsed.window.to.getTime() < Date.now() - 60_000;
    return Response.json(value, { headers: { "Cache-Control": cacheControl(live && !settled, !live) } });
  } catch (error) {
    return errorResponse(error);
  }
}
