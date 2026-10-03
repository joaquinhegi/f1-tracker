# Tasks: deploy-production-hardening

Commits land on `feat/deploy-production` (same PR). Findings come from `openspec/changes/deploy-production/verify-report.md`.

## Review Workload Forecast

- Estimated changed lines: 150–250.
- Delivery: single PR, under the accepted `size:exception`.
- Chained PRs recommended: No.
- Decision needed before apply: No.

## Phase 1: Bootstrap regression (CRITICAL)

- [x] 1.1 `bootstrap.sh` sources `infra/.env` when present.
  - With `OCI_*` unset, it skips the rclone remote step with a WARN and still installs unattended-upgrades and the systemd timers.
  - Prove it with an `env -i` dry-run that fakes every system-changing command.
- [x] 1.2 Add a source guard (`[[ "${BASH_SOURCE[0]}" == "$0" ]]`) around `main "$@"` in `bootstrap.sh`, `watchdog.sh` and `backup.sh`.
- [x] 1.3 RUNBOOK: after filling `infra/.env`, re-run `bootstrap.sh` to configure the rclone remote. Add a note that the first deploy starts empty.

## Phase 2: Backup failure visibility

- [x] 2.1 `backup.sh`: if `docker compose ps` fails, or `rclone size` fails after the upload, record `last_result unhealthy` before exiting non-zero. Dry-run both paths and confirm the watchdog then alerts once.

## Phase 3: Scheduler alert delivery (Strict TDD)

- [x] 3.1 RED: a test where an ntfy delivery failure (`URLError` / `HTTPError`) leaves the alert state unpersisted, so the alert is retried on the next tick.
- [x] 3.2 GREEN: `NtfyNotifier` surfaces the failure; the service keeps its state-after-success semantics.
- [x] 3.3 Replace the type-only checks in `test_ntfy.py` with behavioural assertions. Add an explicit wiring assertion in `test_main.py`.

## Phase 4: First deploy and CI

- [x] 4.1 Automatic backfill is off for the first deploy. Use a documented `BACKFILL_ENABLED` default or switch, and keep the local dev behaviour intact.
- [x] 4.2 `ci.yml`: grant `packages: write` only on the image build job. Add the `org.opencontainers.image.source` label to the images.

## Phase 5: Gate

- [x] 5.1 Must pass: scheduler pytest, web tests, `shellcheck infra/ops/*.sh`, `docker compose config --quiet`, and `gitleaks git`.
