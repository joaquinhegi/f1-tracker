export const dynamic = "force-dynamic";

/** GET /api/health -> liveness signal only, never calls the api container or any upstream. */
export async function GET(): Promise<Response> {
  return Response.json({ status: "ok" });
}
