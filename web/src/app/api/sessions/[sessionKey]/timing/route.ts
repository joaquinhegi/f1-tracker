import { container } from "@/composition/server-container";
import { sessionResponse } from "../../_lib/session-route";

export const dynamic = "force-dynamic";

/** GET /api/sessions/:sessionKey/timing -> SessionTimingDto (features/timing/application/timing-dto.ts) */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/sessions/[sessionKey]/timing">,
): Promise<Response> {
  const { sessionKey } = await params;
  return sessionResponse(sessionKey, (key) => container().getSessionTiming(key));
}
