import { TtlCache } from "@/shared/cache/ttl-cache";
import { RateLimiter } from "@/shared/http/rate-limiter";

export type QueryValue = string | number | boolean | undefined;

/** One query parameter. OpenF1 filters put the operator in the key (`date>=`). */
export type QueryParam = readonly [key: string, value: QueryValue];

export class UpstreamError extends Error {
  constructor(
    readonly upstream: string,
    readonly status: number,
    readonly url: string,
    readonly detail?: string,
  ) {
    super(`${upstream} responded ${status} for ${url}${detail ? `: ${detail}` : ""}`);
    this.name = "UpstreamError";
  }

  /** Public OpenF1 restricts ALL data to paying users while a session is live. */
  get isLiveRestriction(): boolean {
    return this.status === 401 && /live f1 session/i.test(this.detail ?? "");
  }
}

export interface JsonClientOptions {
  name: string;
  baseUrl: string;
  limiter: RateLimiter;
  cache: TtlCache;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Fail fast instead of queueing longer than this behind the rate limiter. */
  maxQueueWaitMs?: number;
  /** Treat this status + body as "empty result" (OpenF1 public returns 404 "No results found."). */
  isEmptyResult?: (status: number, body: string) => boolean;
}

export function buildUrl(baseUrl: string, path: string, query: readonly QueryParam[]): string {
  const base = baseUrl.replace(/\/+$/, "");
  const parts = query
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => {
      // Keep comparison operators readable: "date>=2024-01-01" (OpenF1 syntax).
      const match = /^(.*?)(>=|<=|>|<)?$/.exec(key);
      const name = encodeURIComponent(match?.[1] ?? key);
      const op = match?.[2];
      const encodedValue = encodeURIComponent(String(value));
      return op ? `${name}${op}${encodedValue}` : `${name}=${encodedValue}`;
    });
  return `${base}${path}${parts.length ? `?${parts.join("&")}` : ""}`;
}

/** Rate-limited, cached, coalesced JSON GET client for one upstream. */
export class JsonClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: JsonClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get name(): string {
    return this.options.name;
  }

  async getJson<T>(path: string, query: readonly QueryParam[], ttlMs: number): Promise<T> {
    const url = buildUrl(this.options.baseUrl, path, query);
    return this.options.cache.getOrLoad<T>(`${this.options.name} ${url}`, ttlMs, () =>
      this.fetchJson<T>(url),
    );
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const { limiter, timeoutMs = 15_000, maxQueueWaitMs = 20_000, isEmptyResult } = this.options;
    await limiter.acquire(maxQueueWaitMs);

    const response = await this.fetchImpl(url, {
      headers: { Accept: "application/json", "User-Agent": "f1-tracker-web" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    if (!response.ok) {
      if (isEmptyResult?.(response.status, body)) return [] as T;
      throw new UpstreamError(this.options.name, response.status, url, extractDetail(body));
    }
    return JSON.parse(body) as T;
  }
}

function extractDetail(body: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "detail" in parsed) {
      return String((parsed as { detail: unknown }).detail).slice(0, 300);
    }
  } catch {
    // not JSON
  }
  return body.slice(0, 300) || undefined;
}
