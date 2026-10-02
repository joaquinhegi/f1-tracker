import { container } from "@/composition/server-container";
import { sessionResponse } from "../../_lib/session-route";

export const dynamic = "force-dynamic";

/** GET /api/sessions/:sessionKey/team-radio -> TeamRadioDto (features/radio/application/radio-dto.ts) */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/sessions/[sessionKey]/team-radio">,
): Promise<Response> {
  const { sessionKey } = await params;
  return sessionResponse(sessionKey, (key) => container().getTeamRadio(key));
}
