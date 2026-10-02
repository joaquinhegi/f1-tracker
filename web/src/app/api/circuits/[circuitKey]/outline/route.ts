import { container } from "@/composition/server-container";
import { outlineToDto } from "@/features/circuit/application/circuit-outline-dto";
import { errorResponse } from "../../../_lib/error-response";

export const dynamic = "force-dynamic";

/** GET /api/circuits/:circuitKey/outline -> CircuitOutlineDto */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/circuits/[circuitKey]/outline">,
): Promise<Response> {
  const { circuitKey } = await params;
  const key = Number(circuitKey);
  if (!Number.isInteger(key) || key <= 0) {
    return Response.json(
      { error: { code: "bad_request", message: "circuitKey must be a positive integer" } },
      { status: 400 },
    );
  }
  try {
    const outline = await container().getCircuitOutline(key);
    return Response.json(outlineToDto(outline), {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
