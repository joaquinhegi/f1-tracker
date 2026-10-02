# Exploration: deploy-production

Zero-cost production deployment (Oracle Cloud Always Free ARM VM + Cloudflare). Engram mirror: `sdd/deploy-production/explore`.

> **Superseded decisions (2026-10-02):** after this exploration the user chose **Tailscale Funnel instead of Cloudflare** (no custom domain), rejected Pay-As-You-Go (the tenancy stays Always Free), and chose a public GitHub repo. `proposal.md` and `design.md` are authoritative.

## Current State

- **web/ BFF**: `src/composition/server-container.ts` memoizes one container on `globalThis.__f1Container`. It wires one in-memory `TtlCache` with in-flight coalescing (`shared/cache/ttl-cache.ts`) and two FIFO token-bucket `RateLimiter`s (`shared/http/rate-limiter.ts`):
  - self-hosted: 28 req/10 s, burst 8
  - public: 3 req/s + 30 req/min, burst 6

  It also wires a `FileCircuitOutlineStore` that uses `node:fs` under `<F1_CACHE_DIR>/circuit-outlines/*.json`. The `bff-data-access` requirement "never exceed the upstream limit in any sliding window" is implemented as a **single-process invariant**.
- **Defaults**: `shared/config/server-config.ts` holds the only `127.0.0.1` defaults, and all of them can be overridden by env vars.
- **infra/**: `mongo:7`, `api` and `scheduler`, all with `restart: unless-stopped`. `mongo` and `api` are bound to `127.0.0.1` only. `infra/openf1/Dockerfile` already supports amd64 and arm64. No service has `logging` limits.
- **Gaps**:
  - There is no `web/Dockerfile`.
  - `infra/README.md` references `infra/.env.example`, which does not exist.
  - The project is not a git repo.

## Approaches: where the web app runs

| Approach | Pros | Cons | Effort |
|---|---|---|---|
| 1. Cloudflare Workers via OpenNext | Edge compute; no VM load; auto-scaling | `node:fs` outline store needs a KV/R2 rewrite. Per-isolate cache and rate limiters break the single-process upstream-limit guarantee. A second tunnel hostname plus an Access service token is needed to reach private OpenF1. OpenNext has open Next.js 16.3 issues (opennextjs-cloudflare#1300). Free plan: 100k req/day, 10 ms CPU per request. | High |
| 2. **Same Oracle VM, Docker, behind Cloudflare Tunnel** | No BFF code changes. Reaches OpenF1 and Mongo over the Compose network. One VM to operate. Free edge TLS/CDN for the existing `Cache-Control` headers. No inbound ports needed. | Shares the 2 OCPU / 12 GB pool. Single point of failure. Needs a new `web/Dockerfile` and Compose service. | Low–Medium |

## Recommendation

Use approach 2: run the web app on the same Oracle VM in Docker, with Cloudflare Tunnel providing DNS, TLS and CDN only, and no Workers compute.

## Findings

- **Tunnel**:
  - Named tunnels require a domain delegated to Cloudflare DNS.
  - `trycloudflare.com` quick tunnels rotate their hostname on restart and are unsuitable for production.
  - Tunnel is free and unmetered.
  - Expose only the web hostname. Never tunnel `mongo` or `api`.
- **Access control**:
  - The Cloudflare Zero Trust free plan covers up to 50 users.
  - OpenF1 and the F1TV token stay private in every case.
  - Making the web app public or gated is a product/ToS decision.
- **Oracle VM**:
  - Always Free Ampere A1 is now **2 OCPU / 12 GB in total**, enforced since 2026-08-18 (Oracle docs, fetched 2026-10-02).
  - Storage: 200 GB block storage (boot + block). Object Storage is 20 GB on Always-Free-only accounts, or 10+10+10 GB on PAYG.
  - Ubuntu 24.04 uses the GA kernel 6.8.x, and `mongo:7` is unaffected by SERVER-121912 in any case. A1 is ARMv8.2-A, as MongoDB requires.
  - **Risk: out of capacity.** A1.Flex "out of capacity" errors are common.
  - **Risk: idle reclaim.** Oracle reclaims idle instances when the 7-day p95 of CPU, network and memory are all below 20%. Converting the tenancy to PAYG (still $0 within Always Free) exempts it.
  - **Ports**: the tunnel needs no inbound ports; SSH needs one narrow rule.
- **Images**: build them in GitHub Actions on arm64 runners (free tier), push to GHCR, and run `docker compose pull` on the VM.
- **Operations**:
  - **Secrets and token refresh**: secrets stay in `infra/.env`. The token is refreshed by hand over SSH, following the existing runbook.
  - **Backups**: nightly `mongodump` to free Object Storage. Measured size is about 42 MB per session; a full season is about 4.5 GB, estimated at 5–7 GB.
  - **Logs**: there is no log rotation yet. Add `json-file` with `max-size` and `max-file`.
  - **Restarts**: new services use `unless-stopped`.
  - **Monitoring**: an external uptime check, or cron + curl reading the scheduler's `/data/*.json` status files.
  - **Updates**: `compose pull && up -d`, plus unattended-upgrades for the OS.
- **Delivery**: a git repo plus GitHub, CI that builds arm64 images to GHCR, then on the VM `ssh` → `docker compose pull && up -d`. SDD must not run `git init`, so the user does it or authorizes it explicitly.
- **Code**: no changes to cache, rate-limit or outline-store code. Only env vars change: `OPENF1_SELF_HOSTED_URL` points to the Compose service and `F1_CACHE_DIR` to a persistent volume. Hydration warning #418 is not confirmed in the code.

## Risks

- Oracle A1 capacity may be unavailable when the instance is created.
- Idle reclamation applies unless the tenancy is converted to PAYG.
- The 2 OCPU / 12 GB pool is shared by mongo, api, scheduler, web and cloudflared.
- OpenNext has Next.js 16.3 issues; this only matters if the recommendation is overridden.
- The F1TV / livetiming ToS for public exposure is unresolved.
- CI is blocked until the project is a git repo.

## Open Questions

1. Is a domain on Cloudflare DNS available, or will one be registered?
2. Should the web app be public or gated by Cloudflare Access?
3. Is converting the Oracle tenancy to PAYG acceptable, to avoid idle reclamation?
4. Should the GitHub repo be public or private, and who runs `git init` and the first push?
5. What backup destination and cadence, and what alerting mechanism?

## Scope Boundaries

**In**:
- `web/Dockerfile`, the web Compose service and its healthcheck
- Compose logging limits and web wiring
- `infra/.env.example`
- the named Cloudflare Tunnel (one hostname, pointing to web)
- SSH ops runbooks for backup and update
- a GitHub Actions workflow that builds arm64 images and pushes them to GHCR

**Out**:
- BFF cache, rate-limiter and outline-store code changes
- `infra/.env`
- `git init` and the first commit, unless the user authorizes them
- an OpenNext/Workers migration
