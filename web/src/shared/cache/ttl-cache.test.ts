import { describe, expect, it, vi } from "vitest";
import { FakeClock } from "@/shared/testing/fake-clock";
import { TtlCache } from "./ttl-cache";

describe("TtlCache", () => {
  it("serves a cached value until its TTL expires", async () => {
    const time = new FakeClock(0);
    const cache = new TtlCache(time.clock);
    const loader = vi.fn().mockResolvedValueOnce("a").mockResolvedValueOnce("b");

    expect(await cache.getOrLoad("k", 1000, loader)).toBe("a");
    time.advance(999);
    expect(await cache.getOrLoad("k", 1000, loader)).toBe("a");
    time.advance(1);
    expect(await cache.getOrLoad("k", 1000, loader)).toBe("b");
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent loads of the same key into one call", async () => {
    const cache = new TtlCache(new FakeClock(0).clock);
    let resolve!: (v: number) => void;
    const loader = vi.fn(() => new Promise<number>((r) => (resolve = r)));

    const calls = Array.from({ length: 50 }, () => cache.getOrLoad("k", 1000, loader));
    resolve(42);

    expect(await Promise.all(calls)).toEqual(Array(50).fill(42));
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures", async () => {
    const cache = new TtlCache(new FakeClock(0).clock);
    const loader = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");

    await expect(cache.getOrLoad("k", 1000, loader)).rejects.toThrow("boom");
    expect(await cache.getOrLoad("k", 1000, loader)).toBe("ok");
  });

  it("evicts the oldest entry when full", () => {
    const cache = new TtlCache(new FakeClock(0).clock, 2);
    cache.set("a", 1, 1000);
    cache.set("b", 2, 1000);
    cache.set("c", 3, 1000);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
  });
});
