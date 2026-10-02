import { OutlineUnavailableError } from "@/features/circuit/application/get-circuit-outline";
import { NoMeetingFoundError } from "@/features/weekend/application/get-weekend-overview";
import { UpstreamError } from "@/shared/http/json-client";
import { RateLimitExceededError } from "@/shared/http/rate-limiter";

export interface ApiError {
  error: { code: string; message: string };
}

function json(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: { code, message } } satisfies ApiError, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}

/** Maps use-case and upstream failures to stable BFF error responses. */
export function errorResponse(error: unknown): Response {
  if (error instanceof OutlineUnavailableError) {
    return json(404, "outline_unavailable", error.reason);
  }
  if (error instanceof NoMeetingFoundError) {
    return json(404, "no_meeting", error.message);
  }
  if (error instanceof RateLimitExceededError) {
    return json(503, "rate_limited", "Upstream rate limit reached, retry shortly", {
      "Retry-After": String(Math.ceil(error.waitMs / 1000)),
    });
  }
  if (error instanceof UpstreamError) {
    if (error.isLiveRestriction) {
      return json(
        503,
        "upstream_restricted",
        "Public OpenF1 is restricted while a session is live; no local data available",
        { "Retry-After": "300" },
      );
    }
    return json(502, "upstream_error", `${error.upstream} responded ${error.status}`);
  }
  console.error("[api] unexpected error", error);
  const message = error instanceof Error ? error.message : "Unexpected error";
  return json(502, "upstream_unreachable", message);
}
