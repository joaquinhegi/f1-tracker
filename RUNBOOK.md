# Production Runbook

Terse operator checklists for the Oracle A1 VM. Background and rationale live
in `openspec/changes/deploy-production/design.md`. All commands run over SSH
on the tailnet (`tailscale up --ssh`), from `/opt/f1-tracker`.

## Bootstrap (new or reclaimed VM)

1. Create the Oracle A1 VM (Always Free, Ubuntu 24.04 arm64).
2. Paste `infra/ops/cloud-init.yaml` as user-data, with its two
   `REPLACE_*` placeholders filled in: the repo URL and a single-use,
   1 h Tailscale auth key.
3. Boot the VM. Cloud-init clones the repo to `/opt/f1-tracker` and runs
   `infra/ops/bootstrap.sh`, which is idempotent: docker, the compose
   plugin, tailscale (`up --ssh`, `funnel --bg 3000`), rclone,
   unattended-upgrades and the watchdog/backup systemd timers.
4. Confirm: `tailscale status` shows the node; `systemctl status
   f1-tracker-watchdog.timer f1-tracker-backup.timer` are both active.
5. Create `infra/.env` from `infra/.env.example` with real values. Never
   commit it. Required: `RCLONE_BUCKET`, `OCI_NAMESPACE`, `OCI_COMPARTMENT`,
   `OCI_REGION` (nightly backups), `IMAGE_PREFIX`/`IMAGE_TAG` (image pulls).
6. First deploy: see below. The database starts empty; no backfill runs
   automatically.

## Deploy / update

```bash
cd /opt/f1-tracker && git pull
cd infra && docker compose pull && docker compose up -d --no-build
```

Rollback: edit `IMAGE_TAG` in `infra/.env` to the previous `sha-<short>`,
then re-run `docker compose up -d --no-build`.

## Token refresh (F1TV, expires ~every 4 days)

1. Get a fresh token (see `infra/README.md` section 1).
2. `$EDITOR infra/.env` and replace `F1_TOKEN=`.
3. `docker compose up -d scheduler` (recreates only the scheduler).
4. `docker compose exec scheduler cat /data/token-status.json` to confirm.

## Backup / restore

- Nightly backup runs automatically via `f1-tracker-backup.timer`
  (`infra/ops/backup.sh backup`): `mongodump` streamed through `rclone
  rcat` to Object Storage, 7-day retention pruned after a successful
  upload.
- Manual backup: `infra/ops/backup.sh backup`.
- List backups: `infra/ops/backup.sh list`.
- Restore (destructive, requires explicit confirmation):
  `infra/ops/backup.sh restore <object-name> --confirm`.

## Rebuild after reclaim

1. Repeat **Bootstrap** on a new VM (same cloud-init, a fresh 1 h auth key).
2. Delete the old tailnet node first so the `*.ts.net` hostname is reused.
3. Restore the latest backup (see above) before declaring it done.

## Measuring utilisation (idle-reclaim risk)

```bash
docker stats --no-stream
free -h
docker system df
```

`tailscale status` plus the OCI console's instance metrics cover CPU and
network over the last few days.

## GHCR packages: one-time switch to public

GHCR packages default to **private**. The VM pulls prebuilt images, so each
of `f1-tracker-web`, `f1-tracker-api` and `f1-tracker-scheduler` must be
switched to public once, from the package's GitHub settings page
(Package settings -> Change visibility -> Public). CI authenticates with
`GITHUB_TOKEN` regardless; this only affects anonymous `docker pull` on
the VM.

## Forced alert test

Trigger each event once and confirm it arrives on the configured ntfy
topic: stop a container (`docker compose stop web`) for the health
alerts, rename/corrupt a token to force `expiring`/`expired`, and run
`infra/ops/backup.sh backup` against an unreachable mongo container for
the backup failure alert. Restart/undo each afterward and confirm the
matching recovery notice arrives.
