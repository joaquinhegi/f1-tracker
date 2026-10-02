/** Browser-side client for this app's BFF (`/api/*`). Client-safe. */

/** Error envelope codes the BFF returns, plus "network" when the request never got an answer. */
export type BffErrorCode =
  | "bad_request"
  | "upstream_restricted"
  | "rate_limited"
  | "upstream_error"
  | "upstream_unreachable"
  | "outline_unavailable"
  | "no_meeting"
  | "network"
  | (string & {});

export class BffError extends Error {
  constructor(
    readonly code: BffErrorCode,
    message: string,
    readonly status: number,
    /** From Retry-After, when the BFF sent one. */
    readonly retryAfterMs: number | null,
  ) {
    super(message);
    this.name = "BffError";
  }
}

export async function fetchBff<T>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new BffError("network", "Could not reach the server", 0, null);
  }
  if (response.ok) return (await response.json()) as T;

  const retryAfter = Number(response.headers.get("Retry-After"));
  let code: BffErrorCode = "upstream_error";
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    // not the BFF envelope
  }
  throw new BffError(code, message, response.status, Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null);
}

/** Exponential backoff for retries: 2 s, 4 s, 8 s ... capped, or the server's Retry-After. */
export function retryDelayMs(attempt: number, error: unknown, maxMs = 30_000): number {
  if (error instanceof BffError && error.retryAfterMs !== null) return Math.min(error.retryAfterMs, 5 * 60_000);
  return Math.min(maxMs, 2_000 * 2 ** Math.max(0, attempt - 1));
}
