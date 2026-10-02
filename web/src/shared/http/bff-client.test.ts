import { afterEach, describe, expect, it, vi } from "vitest";
import { BffError, fetchBff, retryDelayMs } from "./bff-client";

afterEach(() => vi.unstubAllGlobals());

describe("fetchBff", () => {
  it("parses the BFF error envelope and Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      Response.json({ error: { code: "upstream_restricted", message: "restricted" } }, { status: 503, headers: { "Retry-After": "300" } }),
    ));
    const error = await fetchBff("/api/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BffError);
    expect(error).toMatchObject({ code: "upstream_restricted", status: 503, retryAfterMs: 300_000 });
  });

  it("reports network failures as code 'network'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    await expect(fetchBff("/api/x")).rejects.toMatchObject({ code: "network", status: 0 });
  });
});

describe("retryDelayMs", () => {
  it("backs off exponentially up to a cap, or honours Retry-After", () => {
    expect([1, 2, 3, 10].map((n) => retryDelayMs(n, new Error()))).toEqual([2_000, 4_000, 8_000, 30_000]);
    expect(retryDelayMs(1, new BffError("rate_limited", "", 503, 7_000))).toBe(7_000);
  });
});
