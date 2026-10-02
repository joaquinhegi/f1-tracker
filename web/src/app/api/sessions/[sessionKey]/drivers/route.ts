import { container } from "@/composition/server-container";
import { sessionResponse } from "../../_lib/session-route";

export const dynamic = "force-dynamic";

/** GET /api/sessions/:sessionKey/drivers -> SessionDriversDto (features/drivers/application/driver-dto.ts) */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/sessions/[sessionKey]/drivers">,
): Promise<Response> {
  const { sessionKey } = await params;
  return sessionResponse(sessionKey, (key) => container().getSessionDrivers(key));
}
