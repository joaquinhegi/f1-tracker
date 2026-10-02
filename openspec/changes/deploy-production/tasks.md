# Tasks: Zero-cost production deployment

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Raw estimate | ~905 lines |
| Trim plan | Terse RUNBOOK (−60); single `lib.sh`, `restore` as a `backup.sh` subcommand (−40); shared pytest fixtures (−15); CI gitleaks deferred (already excluded, no change) |
| Trimmed estimate | ~790 lines |
| 400-line risk (default) | High |
| 800-line risk (configured budget) | Medium — thin margin |
| Chained PRs recommended | No |
| Delivery strategy | single-pr |
| Chain strategy | pending |

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: High
```

Literal line uses the default 400 budget (High) for guard compatibility. The project's configured budget is 800, where trimmed is Medium with a thin margin — apply MUST track the real diff and stop if it creeps past 800.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Whole change (single PR, trimmed) | PR 1 | `pnpm --dir web test`; `cd infra/scheduler && <venv-python> -m pytest -q` | `docker compose config` + manual forced-alert/restore runbook steps (9.6–9.7) | `git revert` the PR; `tailscale funnel off` + `docker compose down` on the VM |

## Phase 1: Repo bootstrap (apply, user-authorized)
- [x] 1.1 Harden `.gitignore` (`node_modules/`, `.next/`, `.cache/`, `.atl/`, `*.archive.gz`, `infra/.env`); run `gitleaks dir .` clean.
- [x] 1.2 `git init`; commit `chore: import existing project` on `main`.
- [x] 1.3 `gh repo create --public --source . --push`.
- [x] 1.4 Branch `feat/deploy-production` off `main`.

## Phase 2: Scheduler — Notifier port + ntfy adapter (TDD)
- [ ] 2.1 RED `tests/test_ntfy.py`: ntfy POST never leaks the token/topic (fake opener).
- [ ] 2.2 GREEN `adapters/ntfy.py`: `NtfyNotifier.notify`.
- [ ] 2.3 RED test: unset `NTFY_TOPIC` → no call, no raise.
- [ ] 2.4 GREEN `NullNotifier`; wire selection in `__main__.py`.

## Phase 3: Scheduler — alerts domain + state + wiring (TDD)
- [ ] 3.1 RED `tests/test_alerts.py`: `evaluate()` fires once per new failure state (token/ingestor/backfill).
- [ ] 3.2 GREEN `alerts.py`: `Alert` dataclass + `evaluate()`.
- [ ] 3.3 RED test: no repeat while unchanged; recovery alert on healthy return.
- [ ] 3.4 GREEN extend `evaluate()`: dedup + recovery.
- [ ] 3.5 RED test: `JsonFileAlertState` load/save round-trip; save only after notify succeeds.
- [ ] 3.6 GREEN `AlertStateStore` in `ports.py`; `JsonFileAlertState` in `adapters/json_cache.py`.
- [ ] 3.7 RED test: crash (`expected_key` cleared) invokes the notifier.
- [ ] 3.8 GREEN wire `evaluate`+`Notifier`+state into `service.py` `tick()`; REFACTOR dedupe, confirm no secret leaks.

## Phase 4: Scheduler — periodic token health check (TDD)
- [ ] 4.1 RED `tests/test_service.py`: periodic check every `TOKEN_CHECK_MINUTES` (360) re-assesses token, refreshes status file.
- [ ] 4.2 GREEN add periodic check to `service.py`; wire env in `__main__.py`.
- [ ] 4.3 Verify: reuses the 3.3–3.4 dedup/recovery path (no duplicate alert).

## Phase 5: Web — health route (TDD)
- [ ] 5.1 RED `route.test.ts`: `GET /api/health` → 200 `{status:"ok"}`, no upstream call.
- [ ] 5.2 GREEN create `web/src/app/api/health/route.ts`, `force-dynamic`.

## Phase 6: Web image + Compose + CI (apply)
- [ ] 6.1 `web/Dockerfile` (deps→build→runner, `node:22-bookworm-slim`, corepack pnpm 11.9.0 `--frozen-lockfile`, standalone copy, `USER node`, healthcheck); `.dockerignore`; `next.config.ts` standalone.
- [ ] 6.2 Compose: add `web` service (`127.0.0.1:3000`, `OPENF1_SELF_HOSTED_URL`, `F1_CACHE_DIR` volume, `depends_on: api`).
- [ ] 6.3 `x-logging` anchor (json-file 10m×3) on every service; confirm restart policy.
- [ ] 6.4 Add `image: ${IMAGE_PREFIX:-f1-tracker}-<svc>:${IMAGE_TAG:-local}` beside `build:` for api/scheduler/web.
- [ ] 6.5 `infra/.env.example`: `F1_TOKEN`, `NTFY_TOPIC`, `TOKEN_CHECK_MINUTES`, `IMAGE_PREFIX`, `IMAGE_TAG`.
- [ ] 6.6 `ci.yml`: web/scheduler/shellcheck jobs gate arm64 matrix build of web/api/scheduler on `ubuntu-24.04-arm`; push sha+latest on main only.
- [ ] 6.7 Verify: `docker compose config` + `pnpm --dir web build` pass.

## Phase 7: Ops scripts (apply, shellcheck-gated)
- [ ] 7.1 `lib.sh`: shared curl/ntfy/state helpers.
- [ ] 7.2 `watchdog.sh`: 2-min timer, diffs web/api/mongo/scheduler health via `lib.sh`.
- [ ] 7.3 `backup.sh` (+ `restore` subcommand): `mongodump|rclone rcat` to OCI (instance-principal); prune `--min-age 7d` after success only.
- [ ] 7.4 `bootstrap.sh`: idempotent install docker/compose/tailscale/rclone/unattended-upgrades/systemd.
- [ ] 7.5 `cloud-init.yaml` + minimal `systemd/*` (watchdog+backup timers).
- [ ] 7.6 `shellcheck infra/ops/*.sh` clean.

## Phase 8: Docs + config (apply)
- [ ] 8.1 `RUNBOOK.md`: terse checklists (bootstrap, deploy, token refresh, backup/restore, rebuild, utilisation).
- [ ] 8.2 Trim `README.md`; point at `RUNBOOK.md`.
- [ ] 8.3 `config.yaml`: remove git ban note, replace Cloudflare with Tailscale Funnel.
- [ ] 8.4 Re-run `gitleaks dir .`; confirm `infra/.env` stays untracked.

## Phase 9: Operator-only steps (NOT apply-executable)
- [ ] 9.1 [OPERATOR] Create Oracle A1 VM (Always Free, Ubuntu 24.04 arm64); create OCI dynamic group + policy + Object Storage bucket.
- [ ] 9.2 [OPERATOR] Generate single-use 1h Tailscale auth key for cloud-init; enable Funnel in the tailnet ACL.
- [ ] 9.3 [OPERATOR] `gh auth login` if not already authenticated.
- [ ] 9.4 [OPERATOR] Populate `infra/.env` on the VM (`F1_TOKEN`, `NTFY_TOPIC`); never commit it.
- [ ] 9.5 [OPERATOR] Switch GHCR packages (web/api/scheduler) to public visibility, one-time.
- [ ] 9.6 [OPERATOR] Forced alert test: trigger each ntfy event once; confirm receipt.
- [ ] 9.7 [OPERATOR] Manual restore test: rebuild VM via `bootstrap.sh`; restore latest backup; confirm the stack serves it.
