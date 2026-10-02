import { describe, expect, it, vi } from "vitest";
import { TtlCache } from "@/shared/cache/ttl-cache";
import { buildUrl, JsonClient, UpstreamError } from "./json-client";
import { RateLimiter } from "./rate-limiter";

function client(fetchImpl: typeof fetch, isEmptyResult?: (s: number, b: string) => boolean) {
  return new JsonClient({
    name: "test",
    baseUrl: "https://api.example/",
    cache: new TtlCache(),
    limiter: new RateLimiter("test", [{ burst: 100, refillPerMs: 1 }]),
    fetchImpl,
    isEmptyResult,
  });
}

const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("buildUrl", () => {
  it("keeps OpenF1 comparison operators in the key and drops undefined values", () => {
    expect(
      buildUrl("https://api.example/", "/v1/location", [
        ["session_key", 9158],
        ["driver_number", undefined],
        ["date>=", "2024-01-01T10:00:00.5"],
        ["date<", "2024-01-01T10:01:00"],
      ]),
    ).toBe(
      "https://api.example/v1/location?session_key=9158&date>=2024-01-01T10%3A00%3A00.5&date<2024-01-01T10%3A01%3A00",
    );
  });
});

describe("JsonClient", () => {
  it("returns parsed JSON and caches it by URL", async () => {
    const fetchImpl = respond(200, [{ a: 1 }]);
    const c = client(fetchImpl);
    expect(await c.getJson("/v1/x", [["k", 1]], 1000)).toEqual([{ a: 1 }]);
    expect(await c.getJson("/v1/x", [["k", 1]], 1000)).toEqual([{ a: 1 }]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps OpenF1's 404 'No results found.' to an empty list", async () => {
    const c = client(respond(404, { detail: "No results found." }), (s, b) => s === 404 && /no results/i.test(b));
    expect(await c.getJson("/v1/laps", [], 1000)).toEqual([]);
  });

  it("flags the public API's live-session restriction", async () => {
    const c = client(
      respond(401, {
        detail: "Live F1 session in progress. Global API access (including past sessions) is restricted",
      }),
    );
    const error = await c.getJson("/v1/sessions", [], 1000).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(UpstreamError);
    expect((error as UpstreamError).isLiveRestriction).toBe(true);
    expect((error as UpstreamError).status).toBe(401);
  });
});
