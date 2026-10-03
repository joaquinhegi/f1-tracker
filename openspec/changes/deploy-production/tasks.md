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
- [x] 2.1 RED `tests/test_ntfy.py`: ntfy POST never leaks the token/topic (fake opener).
- [x] 2.2 GREEN `adapters/ntfy.py`: `NtfyNotifier.notify`.
- [x] 2.3 RED test: unset `NTFY_TOPIC` → no call, no raise.
- [x] 2.4 GREEN `NullNotifier`; wire selection in `__main__.py`.

## Phase 3: Scheduler — alerts domain + state + wiring (TDD)
- [x] 3.1 RED `tests/test_alerts.py`: `evaluate()` fires once per new failure state (token/ingestor/backfill).
- [x] 3.2 GREEN `alerts.py`: `Alert` dataclass + `evaluate()`.
- [x] 3.3 RED test: no repeat while unchanged; recovery alert on healthy return.
- [x] 3.4 GREEN extend `evaluate()`: dedup + recovery.
- [x] 3.5 RED test: `JsonFileAlertState` load/save round-trip; save only after notify succeeds.
- [x] 3.6 GREEN `AlertStateStore` in `ports.py`; `JsonFileAlertState` in `adapters/json_cache.py`.
- [x] 3.7 RED test: crash (`expected_key` cleared) invokes the notifier.
- [x] 3.8 GREEN wire `evaluate`+`Notifier`+state into `service.py` `tick()`; REFACTOR dedupe, confirm no secret leaks.

## Phase 4: Scheduler — periodic token health check (TDD)
- [x] 4.1 RED `tests/test_service.py`: periodic check every `TOKEN_CHECK_MINUTES` (360) re-assesses token, refreshes status file.
- [x] 4.2 GREEN add periodic check to `service.py`; wire env in `__main__.py`.
- [x] 4.3 Verify: reuses the 3.3–3.4 dedup/recovery path (no duplicate alert).

## Phase 5: Web — health route (TDD)
- [x] 5.1 RED `route.test.ts`: `GET /api/health` → 200 `{status:"ok"}`, no upstream call.
- [x] 5.2 GREEN create `web/src/app/api/health/route.ts`, `force-dynamic`.

## Phase 6: Web image + Compose + CI (apply)
- [x] 6.1 `web/Dockerfile` (deps→build→runner, `node:22-bookworm-slim`, corepack pnpm 11.9.0 `--frozen-lockfile`, standalone copy, `USER node`, healthcheck); `.dockerignore`; `next.config.ts` standalone.
- [x] 6.2 Compose: add `web` service (`127.0.0.1:3000`, `OPENF1_SELF_HOSTED_URL`, `F1_CACHE_DIR` volume, `depends_on: api`).
- [x] 6.3 `x-logging` anchor (json-file 10m×3) on every service; confirm restart policy.
- [x] 6.4 Add `image: ${IMAGE_PREFIX:-f1-tracker}-<svc>:${IMAGE_TAG:-local}` beside `build:` for api/scheduler/web.
- [ ] 6.5 `infra/.env.example`: `F1_TOKEN`, `NTFY_TOPIC`, `TOKEN_CHECK_MINUTES`, `IMAGE_PREFIX`, `IMAGE_TAG`. **BLOCKED**: sandbox hard-denies Read/Write/Bash access to any `.env*`-pattern path in this workspace, even to create a placeholder-only file. Needs an operator/orchestrator with that permission, or an explicit grant for this exact path.
- [x] 6.6 `ci.yml`: web/scheduler/shellcheck jobs gate arm64 matrix build of web/api/scheduler on `ubuntu-24.04-arm`; push sha+latest on main only.
- [x] 6.7 Verify: `docker compose config` + `pnpm --dir web build` pass (also proved via a local arm64 `docker build` + run against the live api).

**Split (2026-10-02):** apply stopped at 787/800 changed lines after Phase 6. The SDD runtime objective for this change is capped at 800 and cannot be raised.

The user chose a **single PR** with `size:exception`. The former Phases 7 (ops scripts), 8 (docs + config) and 9 (operator steps) therefore moved to the change `openspec/changes/deploy-production-ops/`. Its commits land on the same branch, `feat/deploy-production`.

## Phases 7–9: moved

See `openspec/changes/deploy-production-ops/tasks.md`.
