import { realSleep, systemClock, type Clock, type Sleep } from "@/shared/time/clock";

export interface BucketRule {
  /** Requests that may be sent back to back. */
  burst: number;
  /** Tokens added per millisecond. */
  refillPerMs: number;
}

/**
 * A bucket that never allows more than `limit` requests in ANY window of
 * `windowMs` (sliding): burst + refill * window <= limit.
 */
export function limitPerWindow(limit: number, windowMs: number, burst = 1): BucketRule {
  if (burst >= limit) throw new Error("burst must be lower than limit");
  return { burst, refillPerMs: (limit - burst) / windowMs };
}

export class RateLimitExceededError extends Error {
  constructor(
    readonly limiter: string,
    readonly waitMs: number,
  ) {
    super(`Rate limiter "${limiter}" would need to wait ${Math.ceil(waitMs)} ms`);
    this.name = "RateLimitExceededError";
  }
}

class TokenBucket {
  private tokens: number;
  private updatedAt: number;

  constructor(
    private readonly rule: BucketRule,
    now: number,
  ) {
    this.tokens = rule.burst;
    this.updatedAt = now;
  }

  private refill(now: number): void {
    this.tokens = Math.min(
      this.rule.burst,
      this.tokens + (now - this.updatedAt) * this.rule.refillPerMs,
    );
    this.updatedAt = now;
  }

  /** Milliseconds until `count` tokens are available (0 if available now). */
  waitTime(now: number, count = 1): number {
    this.refill(now);
    if (this.tokens >= count) return 0;
    return (count - this.tokens) / this.rule.refillPerMs;
  }

  take(): void {
    this.tokens -= 1;
  }
}

/**
 * Token-bucket rate limiter combining several rules (e.g. 3/s AND 30/min).
 * Callers are served strictly FIFO, so a burst of browser clients is spread
 * over time instead of exceeding the upstream limit.
 */
export class RateLimiter {
  private readonly buckets: TokenBucket[];
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(
    readonly name: string,
    rules: BucketRule[],
    private readonly clock: Clock = systemClock,
    private readonly sleep: Sleep = realSleep,
  ) {
    const now = clock().getTime();
    this.buckets = rules.map((rule) => new TokenBucket(rule, now));
  }

  /** Estimated wait for a new caller, counting callers already queued. */
  estimatedWaitMs(): number {
    const now = this.clock().getTime();
    return Math.max(...this.buckets.map((b) => b.waitTime(now, this.pending + 1)));
  }

  /**
   * Resolves when the caller may send one request. Rejects immediately with
   * RateLimitExceededError if the expected wait exceeds `maxWaitMs`.
   */
  acquire(maxWaitMs = Number.POSITIVE_INFINITY): Promise<void> {
    const expected = this.estimatedWaitMs();
    if (expected > maxWaitMs) {
      return Promise.reject(new RateLimitExceededError(this.name, expected));
    }
    this.pending += 1;
    const turn = this.queue.then(async () => {
      try {
        for (;;) {
          const now = this.clock().getTime();
          const wait = Math.max(...this.buckets.map((b) => b.waitTime(now)));
          if (wait <= 0) break;
          await this.sleep(wait);
        }
        this.buckets.forEach((b) => b.take());
      } finally {
        this.pending -= 1;
      }
    });
    this.queue = turn;
    return turn;
  }
}
