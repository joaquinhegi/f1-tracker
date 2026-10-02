# Proposal: Zero-cost production deployment

## Intent

The app only runs on a laptop, so live sessions go unrecorded unless the laptop is on. Run the whole stack at $0 on one Oracle Always Free ARM VM. The public URL exposes only the web UI, operations can be rebuilt and are alerted, and the repo is public with no secrets in it.

## Scope

Sub-projects touched: `web` (Dockerfile, standalone build), `infra/scheduler` (alert notifier), and the `infra` compose config.

### In Scope
- `git init` plus a public GitHub repo created with `gh`. **This lifts the config.yaml git ban for this change only.** Before the first commit: audit `.gitignore` and scan for secrets. Use conventional commits with no AI attribution. The baseline import commit lands before the change branch.
- `web/Dockerfile`: multi-stage, `output: "standalone"`, arm64.
- A `web` Compose service:
  - healthcheck;
  - `OPENF1_SELF_HOSTED_URL=http://api:8000`;
  - `F1_CACHE_DIR` on a volume;
  - bound to `127.0.0.1:3000`.
- Compose hardening:
  - `json-file` log rotation;
  - restart policies;
  - GHCR `image:` refs.
- GitHub Actions on free arm64 runners builds `web`, `api` and `scheduler`, then pushes them to GHCR.
- Tailscale on the host:
  - `funnel` serves only the web app on 443 (`*.ts.net`);
  - SSH goes over the tailnet;
  - zero public inbound ports.
- ntfy alerts for:
  - token expiring or expired;
  - ingestor crashes;
  - backfill failed or abandoned;
  - backup failures;
  - web or api health down.
  The topic comes from `NTFY_TOPIC`, which lives in `infra/.env` only.
- Nightly `mongodump` to Oracle Object Storage (free tier), with retention.
- A reproducible VM bootstrap (cloud-init/script).
- `infra/.env.example`.
- Runbooks: bootstrap, deploy/update, token refresh, backup/restore, rebuild after reclaim, measure utilisation.
- An update to `openspec/config.yaml`: deploy target, and the git rule changed after init.

### Out of Scope
- Cloudflare, custom domains, Workers/OpenNext.
- Converting the tenancy to PAYG.
- Artificial load generation.
- BFF cache, rate-limit and outline-store code.
- Creating or editing `infra/.env`.
- Auth gating of the UI. `funnel` → `serve` is documented only.
- Multi-VM / HA.

## Capabilities

### New Capabilities
- `production-runtime`: web image, compose wiring and hardening, GHCR CI, Tailscale exposure boundary.
- `ops-resilience`: backups/restore, bootstrap/rebuild, utilisation measurement.
- `ops-alerting`: ntfy events, dedup/rate of repeats, topic secrecy.

### Modified Capabilities
- `live-ingestion`: the services requirement adds `web`, log limits and published images. The scheduler emits alerts through a notifier port.

## Approach

- Use the same VM and Docker setup, with no BFF code changes. Compose DNS reaches the `api` service.
- The scheduler gets a `Notifier` port, an ntfy adapter, and a no-op when the topic is unset. TDD covers the domain events.
- A host systemd timer runs the watchdog and the backup. It checks the web/api health endpoints and the backup exit status.
- Deploy with `docker compose pull && up -d` over tailnet SSH.

## Security / Privacy

- No secrets in the repo or images. CI uses `GITHUB_TOKEN` only.
- The F1TV token is personal and stays in `infra/.env`.
- The public URL exposes only the derived UI and BFF. Mongo, the api and SSH stay private.

## Affected Areas

| Area | Impact |
|---|---|
| `web/Dockerfile`, `web/.dockerignore`, `web/next.config.ts` | New/Modified |
| `infra/docker-compose.yml`, `infra/.env.example` | Modified/New |
| `infra/scheduler/f1_scheduler/` (notifier port + adapter) | Modified |
| `infra/ops/` (bootstrap, backup, watchdog) | New |
| `.github/workflows/images.yml` | New |
| `infra/README.md`, runbooks, `openspec/config.yaml`, `.gitignore` | Modified |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Idle reclaim (Always Free) | Med | Backups, scripted rebuild, measure the real p95 |
| A1 out of capacity | Med | Retry, region choice, runbook |
| Secret leaks into a public repo | Low | `.gitignore` audit, secret scan before the first commit |
| Funnel bandwidth limits | Low | Accepted for personal use |
| ~950 changed lines, over the 800 budget | High | sdd-tasks decides: trim the runbooks or take a size exception |

## Rollback Plan

- The laptop stack keeps working unchanged: env defaults stay `127.0.0.1`.
- On the VM: `tailscale funnel off`, then `docker compose down`. Restore Mongo from the last dump.
- Revert the PR to drop the scheduler notifier. It is a no-op without `NTFY_TOPIC`.

## Success Criteria

- [ ] The `*.ts.net` URL serves the UI over HTTPS, and no public inbound ports are open.
- [ ] CI publishes arm64 images, and `compose pull && up -d` updates the VM.
- [ ] Each alert event reaches ntfy in a forced test.
- [ ] A restore from Object Storage into a rebuilt VM succeeds by following the runbook.
- [ ] The secret scan is clean, and `infra/.env` is never tracked.

## Proposal question round

Answered by the user on 2026-10-02 (all working assumptions confirmed):

1. Alerts notify **once per state change** (no periodic re-notification).
2. Backup retention: **7 daily** backups.
3. A whole-VM outage going unalerted is **accepted**; no external pinger.
4. The first deploy **starts empty** (no full-season backfill).
