import { describe, expect, it } from "vitest";
import { FakeClock } from "@/shared/testing/fake-clock";
import { limitPerWindow, RateLimiter, RateLimitExceededError } from "./rate-limiter";

/** Timestamps at which `n` acquisitions were granted. */
async function grantTimes(limiter: RateLimiter, time: FakeClock, n: number): Promise<number[]> {
  const times: number[] = [];
  await Promise.all(
    Array.from({ length: n }, () => limiter.acquire().then(() => times.push(time.nowMs))),
  );
  return times;
}

function maxInAnyWindow(times: number[], windowMs: number): number {
  return Math.max(...times.map((t) => times.filter((u) => u >= t && u < t + windowMs).length));
}

describe("limitPerWindow", () => {
  it("rejects a burst that could break the window limit", () => {
    expect(() => limitPerWindow(3, 1000, 3)).toThrow();
  });
});

describe("RateLimiter", () => {
  it("never exceeds public OpenF1 limits (3/s and 30/min) for a burst of 100 callers", async () => {
    const time = new FakeClock(0);
    const limiter = new RateLimiter(
      "public",
      [limitPerWindow(3, 1000, 1), limitPerWindow(30, 60_000, 6)],
      time.clock,
      time.sleep,
    );

    const times = await grantTimes(limiter, time, 100);

    expect(times).toHaveLength(100);
    expect(maxInAnyWindow(times, 1000)).toBeLessThanOrEqual(3);
    expect(maxInAnyWindow(times, 60_000)).toBeLessThanOrEqual(30);
  });

  it("never exceeds the self-hosted limit (30 / 10 s)", async () => {
    const time = new FakeClock(0);
    const limiter = new RateLimiter("self", [limitPerWindow(28, 10_000, 8)], time.clock, time.sleep);
    const times = await grantTimes(limiter, time, 120);
    expect(maxInAnyWindow(times, 10_000)).toBeLessThanOrEqual(30);
  });

  it("lets the burst through without waiting", async () => {
    const time = new FakeClock(0);
    const limiter = new RateLimiter("x", [limitPerWindow(10, 1000, 5)], time.clock, time.sleep);
    const times = await grantTimes(limiter, time, 5);
    expect(times).toEqual([0, 0, 0, 0, 0]);
  });

  it("fails fast when the queue wait would exceed maxWaitMs", async () => {
    const time = new FakeClock(0);
    const limiter = new RateLimiter("x", [limitPerWindow(2, 1000, 1)], time.clock, time.sleep);
    await limiter.acquire();
    await expect(limiter.acquire(100)).rejects.toBeInstanceOf(RateLimitExceededError);
    await expect(limiter.acquire(5000)).resolves.toBeUndefined();
  });
});
