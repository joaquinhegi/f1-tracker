# Proposal: deploy-production-hardening

## Intent

Close the remaining verification findings of `deploy-production` and `deploy-production-ops` so the production deploy is safe to merge. Both parent changes have used up their SDD runtime attempt budgets. The user (maintainer) chose a new change over resetting an objective, on 2026-10-03.

The commits land on the same branch, `feat/deploy-production`, so this change ships in the same single PR under the accepted `size:exception`.

## Source of truth

Requirements and design are inherited from `openspec/changes/deploy-production/`:

- specs: `production-runtime`, `ops-resilience`, `ops-alerting`, and the `live-ingestion` delta;
- `design.md`.

The findings are listed in `openspec/changes/deploy-production/verify-report.md`, run 1 and run 2.

## Scope

**In** (priority order):

1. **C5-R (CRITICAL regression).** `infra/ops/bootstrap.sh` aborts on unset `OCI_*` when cloud-init runs it before `infra/.env` exists, so the watchdog and backup timers are never installed. Fix it so that:
   - with `OCI_*` unset, the rclone remote step is skipped with a warning;
   - bootstrap reads `infra/.env` when present;
   - RUNBOOK documents re-running bootstrap after `.env` is filled in.
2. **Source guard.** `bootstrap.sh`, `watchdog.sh` and `backup.sh` run `main "$@"` only when executed, not when sourced.
3. **W2.** The silent backup failure paths (`docker compose ps` failing; `rclone size` failing after upload) record a failed state, so the watchdog alerts.
4. **W1.** ntfy delivery failures are surfaced to the service (raise or return failure), so alert state is not persisted and the alert retries on the next tick. Strict TDD.
5. **W7.** The first deploy starts empty: automatic backfill is disabled by default for the first deploy (documented env switch), as the spec requires.
6. **W4/W5.** CI grants `packages: write` only to the image build job, and images carry the `org.opencontainers.image.source` label.
7. **W10 + test_main.** Behavioural assertions in `test_ntfy.py` and an explicit wiring assertion in `test_main.py`.

**Out**:
- W3 (retention by age keeps 7–8 copies). This is documented as accepted.
- The remaining suggestions.
- The operator tasks (`deploy-production-ops` phase 3), which need the VM.
- Parent task 6.5 `infra/.env.example`, which is blocked by the user's permission rule on `.env*` paths and is user-owned.

## Delivery

- Single PR together with the parent changes, under `size:exception`.
- Estimated at 150–250 changed lines.
- It has its own SDD runtime objective.
