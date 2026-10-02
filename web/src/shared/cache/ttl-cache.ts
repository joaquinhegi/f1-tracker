import { systemClock, type Clock } from "@/shared/time/clock";

interface Entry<T> {
  value: T;
  expiresAt: number;
}

/**
 * In-memory TTL cache with in-flight coalescing: concurrent `getOrLoad` calls
 * for the same key share one loader promise, so N browser clients asking for
 * the same upstream resource cause a single upstream request.
 *
 * Failed loads are not cached.
 */
export class TtlCache {
  private readonly entries = new Map<string, Entry<unknown>>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly maxEntries = 2000,
  ) {}

  get<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.clock().getTime()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) return;
    if (this.entries.size >= this.maxEntries) this.evictOne();
    this.entries.set(key, { value, expiresAt: this.clock().getTime() + ttlMs });
  }

  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;

    const promise = loader()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  private evictOne(): void {
    const now = this.clock().getTime();
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        return;
      }
    }
    // Map preserves insertion order: drop the oldest entry.
    const oldest = this.entries.keys().next();
    if (!oldest.done) this.entries.delete(oldest.value);
  }
}
