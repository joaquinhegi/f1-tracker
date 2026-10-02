# Design: Zero-cost production deployment

## Technical Approach

One Oracle A1 VM runs the existing Compose stack plus `web`. Tailscale on the host exposes only `127.0.0.1:3000` through Funnel. CI builds arm64 images to GHCR, and the operator deploys by hand over tailnet SSH. Alerts come from two sources: the scheduler emits domain events through a new `Notifier` port, and a host watchdog covers health and backups. Both deduplicate per state change.

Hexagonal boundaries:
- web: one route only (`app/api/health`). No feature, domain or infrastructure change.
- scheduler: new domain module `alerts.py`, new ports `Notifier` and `AlertStateStore`, new adapters `ntfy.py` and a JSON store.

## Architecture Decisions

| # | Decision | Rejected | Rationale |
|---|---|---|---|
| 1 | Add `GET /api/health`. It returns `{status:"ok"}`, is `force-dynamic`, and does not call the container. | Reusing `/api/weekend/current` | That route would mark the web app unhealthy whenever upstream is down, and it spends rate-limit budget. The new route is not BFF data code, so the "no BFF changes" intent holds. |
| 2 | `web/Dockerfile` on `node:22-bookworm-slim` with stages deps → build → runner. Uses `corepack` pnpm 11.9.0 and `--frozen-lockfile`, and copies `.next/standalone` and `.next/static` (there is no `public/`). Runs as `USER node`, with `HOSTNAME=0.0.0.0`, `PORT=3000` and `F1_CACHE_DIR=/cache` on a volume. The healthcheck uses `node -e fetch(...)`. | A full `node_modules` image; Alpine | Standalone output is verified in `node_modules/next/dist/docs/.../output.md`. `server.js` honours `HOSTNAME`/`PORT`. Alpine adds musl risk. |
| 3 | One compose file keeps both `build:` and `image: ${IMAGE_PREFIX:-f1-tracker}-<svc>:${IMAGE_TAG:-local}`. On the VM, `.env` sets `IMAGE_PREFIX=ghcr.io/<owner>/f1-tracker` and `IMAGE_TAG=sha-<short>`. Add an `x-logging` anchor (json-file, 10m×3) to every service. The `web` service binds `127.0.0.1:3000` and depends on `api: service_started`, so a down `api` triggers the public fallback. | An override file; profiles; digest pinning | Laptop behaviour is unchanged (local defaults). A pinned sha tag gives rollback by editing one line. Digests add manual churn. |
| 4 | `tailscaled` runs on the host (apt) with `tailscale up --ssh`. `tailscale funnel --bg 3000` persists in tailscaled state across reboots. The OCI security list has **no** ingress rules. Break-glass access is the OCI serial console. | A sidecar container; `sshd` bound to the tailnet IP | Funnel must reach a host loopback port. Tailscale SSH avoids boot-order races and needs no public port 22. |
| 5 | Scheduler: a pure `alerts.evaluate(prev, observations)` returns `(new_state, alerts)` and fires on every state change, recoveries included. State lives in `/data/alert-state.json` and is saved only after a successful send, so a failed send retries on the next tick. Host side: `watchdog.sh` runs on a 2-min timer, keeps state in `/var/lib/f1-tracker/alerts/`, and covers web, api, mongo, scheduler and backup. | One host-side watcher parsing `/data/*.json` | Domain events belong in the scheduler (TDD, hexagonal). Container and backup health can only be seen from the host. |
| 6 | `backup.sh`: `mongodump --archive --gzip` streams through `rclone rcat` to an OCI bucket, using rclone's `oracleobjectstorage` backend with **instance-principal** auth. It prunes with `rclone delete --min-age 7d`, only after a successful upload. `backup.sh restore <object>` feeds `mongorestore --archive --gzip --drop`. | `oci-cli`; S3-compat Customer Secret Keys; an OCI lifecycle rule | Instance principal keeps keys off the disk. Pruning in the script lives in the repo and never deletes after a failed run. S3-compat keys are the documented fallback. |
| 7 | Minimal `cloud-init.yaml` (git clone of the public repo, then run `bootstrap.sh`), with a **single-use, 1 h** Tailscale auth key pasted at create time. `bootstrap.sh` is idempotent: Docker CE and the compose plugin, tailscale, rclone, unattended-upgrades, and systemd units. | Manual SSH with a temporary port 22; a cloud-init-only setup | Zero inbound ports from the first boot. The same script serves rebuild-after-reclaim. |
| 8 | `ci.yml`: the `web` (lint/typecheck/test), `scheduler` (pytest) and `shellcheck` jobs gate a matrix build of `{web, api, scheduler}` on `ubuntu-24.04-arm`. It pushes **linux/arm64 only**, tagged `sha-<short>` and `latest`, on `main`. Pull requests build without pushing. Permissions are `packages: write`, using `GITHUB_TOKEN` only. Images carry the `org.opencontainers.image.source` label. Deploy stays manual: `git pull && compose pull && up -d --no-build`. | amd64 plus a manifest merge; deploying from CI via a Tailscale OAuth secret; Watchtower | The VM and the Mac are both arm64, so native runners mean no QEMU. Automated deploy would add a repo secret or an ungated update. |
| 9 | Run before the change branch: harden the root `.gitignore` (`node_modules/`, `.next/`, `.cache/`, `.atl/`, `*.archive.gz`); run `gitleaks dir .` and require a clean result; `gh repo create --public --source . --push` with the commit `chore: import existing project`; then branch `feat/deploy-production`. The `openspec/config.yaml` edit (drop the git ban and Cloudflare) goes in the PR. | Importing inside the PR | Keeps the PR diff reviewable. `.atl/` holds absolute personal paths. |
| 10 | Periodic token check every `TOKEN_CHECK_MINUTES` (360), in addition to startup and pre-start. | Startup and pre-start only | Otherwise "expiring" is detected only about 60 min before a race, which is too late to refresh by hand. |

## Data Flow

```
Scheduler tick ─observe─▶ alerts.evaluate(prev,obs) ─changed─▶ Notifier.notify ─POST─▶ ntfy.sh/$NTFY_TOPIC
     │ token state / ingestor crash / backfill:{key}        ok ─▶ AlertStateStore.save
systemd timer ─▶ watchdog.sh ─curl/docker inspect─▶ state file diff ─▶ curl ntfy
systemd timer ─▶ backup.sh ─mongodump│rclone rcat─▶ OCI bucket ; exit≠0 ─▶ watchdog "backup" key
Browser ─HTTPS─▶ *.ts.net (Funnel) ─▶ 127.0.0.1:3000 web ─compose DNS─▶ api:8000 ─▶ mongo
```

Crash detection: `expected_key` is set on `Start` and cleared on `Stop`. If `runner.running_session_key()` returns `None` while `expected_key` is set, the ingestor crashed. The next `Keep` reports recovery.

## Interfaces / Contracts

```python
@dataclass(frozen=True)
class Alert: key: str; state: str; title: str; message: str; recovered: bool
class Notifier(Protocol):
    def notify(self, alert: Alert) -> None: ...   # raises on failure
class AlertStateStore(Protocol):
    def load(self) -> Dict[str, str]: ...
    def save(self, state: Dict[str, str]) -> None: ...
```

The service wraps notifier errors. `NullNotifier` is used when `NTFY_TOPIC` is unset. Messages never include the token or the topic.

## File Changes (estimated changed lines)

| File | Action | ~Lines |
|---|---|---|
| `web/Dockerfile`, `web/.dockerignore`, `web/next.config.ts` | Create/Modify | 55 |
| `web/src/app/api/health/route.ts` + test | Create | 25 |
| `infra/docker-compose.yml`, `infra/.env.example` | Modify/Create | 85 |
| `infra/scheduler/f1_scheduler/{alerts,ports,service,__main__}.py`, `adapters/{ntfy,json_cache}.py` | Create/Modify | 185 |
| `infra/scheduler/tests/test_alerts.py`, `test_ntfy.py`, `test_service.py` | Create/Modify | 150 |
| `infra/ops/{bootstrap,watchdog,backup,lib}.sh`, `cloud-init.yaml`, `systemd/*` | Create | 200 |
| `.github/workflows/ci.yml` | Create | 85 |
| `infra/RUNBOOK.md`, `infra/README.md`, `openspec/config.yaml`, `.gitignore` | Create/Modify | 120 |
| **Total** | | **~905** |

To fit 800: keep the runbook to terse checklists (−60), put watchdog and backup in one `lib.sh` with no separate restore script (−30), and defer a CI gitleaks job (the scan runs once locally). Otherwise split runtime+CI (about 300 lines) and ops+alerting (about 600) into separate PRs. sdd-tasks makes that call.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (pytest, RED first) | `evaluate` transitions, recoveries, no repeats, backfill keys, crash detection, periodic token check, ntfy request shape (fake opener), `NullNotifier` | Pure functions with fakes |
| Unit (vitest) | `/api/health` returns 200 and makes no container call | Route handler test |
| Static | Shell scripts | `shellcheck` in CI |
| Manual | Forced alert for each event; restore into a rebuilt VM | Runbook (success criteria) |

## Threat Matrix

| Boundary | Applicability |
|---|---|
| Documentation-like paths | N/A: nothing classifies or executes files by name |
| Git repository selection | N/A: no automation selects repos; bootstrap is a one-off operator step |
| Commit state | N/A: no commit automation |
| Push state | N/A: CI pushes images, not git refs |
| PR commands | N/A: no PR automation |

## Migration / Rollout

The first deploy starts with an empty database. Rollback: `tailscale funnel off`, set the previous `IMAGE_TAG`, then `compose up -d`. Removing `NTFY_TOPIC` turns the notifier into a no-op. For a rebuild, delete the old tailnet node first so the `*.ts.net` hostname stays the same.

## Open Questions

- [ ] Verify against current docs during apply: the `ubuntu-24.04-arm` label for public repos; the `funnel --bg` syntax and the ports it allows; rclone `oracleobjectstorage` instance-principal auth; GHCR default package visibility (make it public once); and that corepack works with pnpm 11.
- [ ] Backup storage: 7 dailies of a full season (about 2–3 GB gzip each) may exceed the 20 GB Object Storage limit late in the season. The backup log should record archive size.
