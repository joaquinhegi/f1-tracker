import { container } from "@/composition/server-container";
import { errorResponse } from "../../_lib/error-response";

export const dynamic = "force-dynamic";

/** GET /api/weekend/current -> WeekendOverviewDto */
export async function GET(): Promise<Response> {
  try {
    const overview = await container().getWeekendOverview();
    return Response.json(overview, {
      headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=60" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
