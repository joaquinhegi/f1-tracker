import { TtlCache } from "@/shared/cache/ttl-cache";
import type { ServerConfig } from "@/shared/config/server-config";
import { JsonClient } from "@/shared/http/json-client";
import { limitPerWindow, RateLimiter } from "@/shared/http/rate-limiter";
import { PublicOpenF1Adapter, SelfHostedOpenF1Adapter } from "./openf1-http-adapter";
import { RoutingF1DataProvider } from "./routing-f1-data-provider";

/** OpenF1 public answers 404 {"detail":"No results found."} for an empty result. */
const isNoResults = (status: number, body: string) =>
  status === 404 && /no results found/i.test(body);

/**
 * Builds the routed provider. Must be created once per server process so all
 * requests share the cache and the rate limiters.
 */
export function createF1DataProvider(config: ServerConfig): RoutingF1DataProvider {
  const cache = new TtlCache();

  const selfHosted = new SelfHostedOpenF1Adapter(
    new JsonClient({
      name: "self-hosted",
      baseUrl: config.selfHostedUrl,
      cache,
      // infra/ api: 30 requests / 10 s per IP (sliding-window safe, with headroom).
      limiter: new RateLimiter("self-hosted", [limitPerWindow(28, 10_000, 8)]),
      timeoutMs: 8_000,
      maxQueueWaitMs: 10_000,
      isEmptyResult: isNoResults,
    }),
  );

  const publicApi = new PublicOpenF1Adapter(
    new JsonClient({
      name: "public",
      baseUrl: config.publicUrl,
      cache,
      // api.openf1.org free tier: 3 req/s and 30 req/min.
      limiter: new RateLimiter("public", [
        limitPerWindow(3, 1_000, 1),
        limitPerWindow(30, 60_000, 6),
      ]),
      timeoutMs: 15_000,
      maxQueueWaitMs: 20_000,
      isEmptyResult: isNoResults,
    }),
  );

  return new RoutingF1DataProvider(selfHosted, publicApi);
}
