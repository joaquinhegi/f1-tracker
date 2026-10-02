# Tasks: deploy-production-ops

These tasks were split out of `deploy-production`, where they were phases 7–9. Specs and design live in `openspec/changes/deploy-production/`.

Commits land on the branch `feat/deploy-production`, so this change ships in the same PR.

## Review Workload Forecast

- Estimated changed lines: 350–450.
- Delivery: single PR, combined with `deploy-production`, under the user-accepted `size:exception`.
- Chained PRs recommended: No (the user chose a single PR).
- Decision needed before apply: No.

## Phase 1: Ops scripts (apply, shellcheck-gated)

- [x] 1.1 `infra/ops/lib.sh`: shared curl, ntfy and state helpers.
- [x] 1.2 `infra/ops/watchdog.sh`: runs every 2 min. It compares web/api/mongo/scheduler health against the previous state and alerts once per state change, with recovery notices.
- [x] 1.3 `infra/ops/backup.sh`, with a `restore` subcommand:
  - stream `mongodump --archive --gzip` through `rclone rcat` to OCI using instance-principal auth;
  - log the archive size;
  - prune backups older than 7 days, only after a successful upload.
- [x] 1.4 `infra/ops/bootstrap.sh`: idempotent install of docker, the compose plugin, tailscale (`up --ssh`, `funnel --bg 3000`), rclone, unattended-upgrades and the systemd timers.
- [x] 1.5 `infra/ops/cloud-init.yaml`, plus minimal `infra/ops/systemd/*` units: the watchdog and backup timers.
- [x] 1.6 `shellcheck infra/ops/*.sh` is clean, and the existing CI shellcheck job passes.

## Phase 2: Docs + config (apply)

- [ ] 2.1 `RUNBOOK.md`: terse checklists for bootstrap, deploy/update, token refresh, backup/restore, rebuild after reclaim, measuring utilisation, and the one-time switch of GHCR packages to public.
- [ ] 2.2 Trim `infra/README.md` and point it at `RUNBOOK.md`.
- [ ] 2.3 `openspec/config.yaml`: remove the git ban note and replace Cloudflare with Tailscale Funnel.
- [ ] 2.4 Re-run `gitleaks git` and `gitleaks protect --staged`, not a bare `detect --no-git`, which flags `.next/` cache noise. Confirm `infra/.env` stays untracked.

## Phase 3: Operator-only steps (NOT apply-executable)

- [ ] 3.1 [OPERATOR] Create the Oracle A1 VM (Always Free, Ubuntu 24.04 arm64). Create the OCI dynamic group, its policy and the Object Storage bucket.
- [ ] 3.2 [OPERATOR] Generate a single-use, 1 h Tailscale auth key for cloud-init, and enable Funnel in the tailnet ACL.
- [ ] 3.3 [OPERATOR] Populate `infra/.env` on the VM (`F1_TOKEN`, `NTFY_TOPIC`). Never commit it.
- [ ] 3.4 [OPERATOR] Switch the GHCR packages (web/api/scheduler) to public visibility, one time.
- [ ] 3.5 [OPERATOR] Forced alert test: trigger each ntfy event once and confirm it arrives.
- [ ] 3.6 [OPERATOR] Manual restore test: rebuild the VM with `bootstrap.sh`, restore the latest backup, and confirm the stack serves it.
