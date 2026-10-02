import { container } from "@/composition/server-container";
import { sessionWindowResponse } from "../../_lib/session-route";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/:sessionKey/locations?from=<ISO>&to=<ISO> -> LocationWindowDto (features/drivers/application/location-dto.ts)
 * from/to aligned to 5 s, at most 120 s apart (shared/time/time-window.ts).
 */
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/sessions/[sessionKey]/locations">,
): Promise<Response> {
  const { sessionKey } = await params;
  return sessionWindowResponse(sessionKey, request, (key, window) => container().getLocationWindow(key, window));
}
