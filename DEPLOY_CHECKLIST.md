# Deploy Checklist

One-time path from zero to a running production stack, then routine ops.
Do the steps in order. Procedures already in [`RUNBOOK.md`](RUNBOOK.md) are
referenced, not repeated. Deploys run from
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

Placeholders: `<VM_NAME>` (e.g. `f1-tracker`), `<TAILNET>` (your
`*.ts.net` name), `<BUCKET>` (e.g. `f1-tracker-backups`), `<COMPARTMENT>`.

## 0. Prerequisites

- [ ] Oracle Cloud account on **Always Free** (do not upgrade to PAYG).
- [ ] Tailscale account: <https://login.tailscale.com>.
- [ ] `gh auth status` shows you logged in with `repo` scope.
- [ ] ntfy app on your phone, subscribed to an unguessable topic:
      `openssl rand -hex 16` (treat it as a secret).

## 1. Commit `infra/.env.example`

`RUNBOOK.md` refers to it. Values are placeholders; every value is
double-quoted because `bootstrap.sh` sources the file with bash.

- [ ] Create `infra/.env.example` with exactly:

```bash
# Copy to infra/.env (git-ignored). In production deploy.yml renders it.
IMAGE_PREFIX="ghcr.io/joaquinhegi/f1-tracker"
IMAGE_TAG="sha-0000000"
F1_TOKEN=""
NTFY_TOPIC=""
TOKEN_CHECK_MINUTES="360"
BACKFILL_ENABLED="false"
RCLONE_BUCKET="f1-tracker-backups"
OCI_NAMESPACE="your-namespace"
OCI_COMPARTMENT="ocid1.compartment.oc1..replace-me"
OCI_REGION="eu-madrid-1"
```

- [ ] `git add infra/.env.example && gitleaks protect --staged && git commit -m "docs(infra): add .env.example"`

## 2. Oracle Cloud

- [ ] Compute -> Instances -> Create:
  - Image: **Canonical Ubuntu 24.04** (aarch64). Shape: **VM.Standard.A1.Flex**,
    up to **2 OCPU / 12 GB** (the Always Free A1 allowance used by this project).
  - Boot volume: 100 GB (Always Free total block storage is 200 GB; a full
    season backfill needs ~5-7 GB plus images).
  - Networking: public subnet with a public IPv4 (needed for outbound
    traffic only). No SSH key is needed; access is Tailscale SSH.
  - "Out of capacity": retry later, try another availability domain, or
    start with 1 OCPU / 6 GB and resize later.
- [ ] Advanced options -> Management -> cloud-init script: paste a **local,
      uncommitted copy** of `infra/ops/cloud-init.yaml` with:
  - `REPLACE_WITH_REPO_URL` -> `https://github.com/joaquinhegi/f1-tracker.git`
  - `REPLACE_WITH_SINGLE_USE_1H_KEY` -> the auth key from step 3.
  Create the key right before this step: it is single-use and short-lived.
- [ ] Networking -> VCN -> Security List: delete every **ingress** rule
      (including the default TCP 22 from `0.0.0.0/0`). Keep egress.
- [ ] Storage -> Buckets -> Create `<BUCKET>` (Standard tier, private).
- [ ] Identity -> Domains -> Default -> Dynamic groups -> Create
      `f1-tracker-vm` with one matching rule:
      `ANY {instance.id = '<INSTANCE_OCID>'}`
      (or `ANY {instance.compartment.id = '<COMPARTMENT_OCID>'}`).
- [ ] Identity -> Policies -> Create (in the bucket's compartment):

```text
Allow dynamic-group f1-tracker-vm to read buckets in compartment <COMPARTMENT> where target.bucket.name = '<BUCKET>'
Allow dynamic-group f1-tracker-vm to manage objects in compartment <COMPARTMENT> where target.bucket.name = '<BUCKET>'
```

  (With identity domains the console may expect `'Default'/'f1-tracker-vm'`.)
- [ ] Note the values for step 4:
  - `OCI_NAMESPACE`: `oci os ns get`, or Tenancy details -> Object Storage namespace.
  - `OCI_COMPARTMENT`: Identity -> Compartments -> OCID.
  - `OCI_REGION`: region identifier in the console header menu (e.g. `eu-madrid-1`).

## 3. Tailscale

- [ ] Admin console -> DNS: enable **MagicDNS** and **HTTPS Certificates**.
- [ ] Access controls: merge this into the policy file (HuJSON):

```jsonc
{
  "tagOwners": {
    "tag:server": ["autogroup:admin"],
    "tag:ci":     ["autogroup:admin"]
  },
  "grants": [
    // You (and your devices) keep full access; CI may reach only SSH on the VM.
    { "src": ["autogroup:member"], "dst": ["*"], "ip": ["*"] },
    { "src": ["tag:ci"], "dst": ["tag:server"], "ip": ["22"] }
  ],
  "ssh": [
    { "action": "check",  "src": ["autogroup:member"], "dst": ["tag:server"], "users": ["ubuntu", "root"] },
    { "action": "accept", "src": ["tag:ci"],           "dst": ["tag:server"], "users": ["ubuntu"] }
  ],
  "nodeAttrs": [
    { "target": ["tag:server"], "attr": ["funnel"] }
  ]
}
```

- [ ] Settings -> Keys -> Generate auth key: **not reusable**, **tagged
      `tag:server`**, shortest expiry. Use it in step 2's cloud-init.
- [ ] Settings -> Trust credentials (OAuth clients) -> new client with scope
      **Auth Keys: Write** and tag **`tag:ci`**. Save the client ID and secret
      for step 4.
- [ ] After the VM boots: Machines shows `<VM_NAME>` tagged `tag:server`,
      and the RUNBOOK **Bootstrap** step 4 checks pass
      (`tailscale ssh ubuntu@<VM_NAME>`, then `sudo tailscale funnel status`).

## 4. GitHub `production` environment

- [ ] `gh api -X PUT repos/joaquinhegi/f1-tracker/environments/production`
- [ ] Secrets (each command prompts for the value; nothing lands in shell history):

```bash
for s in TS_OAUTH_CLIENT_ID TS_OAUTH_SECRET VM_HOST VM_USER F1_TOKEN NTFY_TOPIC \
         RCLONE_BUCKET OCI_NAMESPACE OCI_COMPARTMENT OCI_REGION; do
  gh secret set "$s" --env production
done
```

| Secret | Value |
| --- | --- |
| `TS_OAUTH_CLIENT_ID` / `TS_OAUTH_SECRET` | Tailscale OAuth client (step 3) |
| `VM_HOST` | MagicDNS name, e.g. `<VM_NAME>` |
| `VM_USER` | `ubuntu` (must match the `tag:ci` SSH rule) |
| `F1_TOKEN` | F1TV JWT: the `data.subscriptionToken` (`eyJ...`) from `infra/README.md` section 1 |
| `NTFY_TOPIC` | the topic from step 0 |
| `RCLONE_BUCKET`, `OCI_NAMESPACE`, `OCI_COMPARTMENT`, `OCI_REGION` | step 2 |

- [ ] Variables (optional; defaults shown):

```bash
gh variable set BACKFILL_ENABLED --env production --body false
gh variable set TOKEN_CHECK_MINUTES --env production --body 360
gh variable set IMAGE_PREFIX --env production --body ghcr.io/joaquinhegi/f1-tracker
gh variable set VM_REPO_DIR --env production --body /opt/f1-tracker  # systemd units assume this path
```

## 5. First deploy

- [ ] `gh workflow run deploy.yml` (deploys the current `main` image).
- [ ] `gh run watch "$(gh run list --workflow deploy.yml -L 1 --json databaseId -q '.[0].databaseId')"`
- [ ] Open `https://<VM_NAME>.<TAILNET>.ts.net` and
      `curl -fsS https://<VM_NAME>.<TAILNET>.ts.net/api/health` -> `{"status":"ok"}`.
- [ ] ntfy shows "f1-tracker deploy success".
- [ ] From now on every green CI run on `main` deploys automatically.

## 6. After the first deploy

- [ ] `gh variable set BACKFILL_ENABLED --env production --body true && gh workflow run deploy.yml`
- [ ] Optional season backfill (~5-7 GB disk, ~2-2.5 h), on the VM:

```bash
sudo -i                      # then:
cd /opt/f1-tracker/infra
docker compose exec scheduler python -m f1_scheduler backfill --year 2026 --dry-run
docker compose exec scheduler python -m f1_scheduler backfill --year 2026  # run inside tmux
```

## 7. Verification

On the VM: `tailscale ssh ubuntu@<VM_NAME>`, `sudo -i`, `cd /opt/f1-tracker/infra`.
The watchdog runs every 2 min, so allow up to ~2 min per alert.

- [ ] Health alert: `docker compose stop web` -> "web service down";
      `docker compose start web` -> "Recovered: web service down".
- [ ] Token alert: follow RUNBOOK **Forced alert test** (temporarily put an
      expired JWT in `infra/.env`, `docker compose up -d scheduler`), then
      undo with `gh workflow run deploy.yml`.
- [ ] Backup alert: `docker compose stop mongo && systemctl start f1-tracker-backup.service`
      -> "backup failed"; `docker compose start mongo && systemctl start f1-tracker-backup.service`
      -> recovery notice.
- [ ] Backup now: `systemctl start f1-tracker-backup.service && journalctl -u f1-tracker-backup.service -n 20`.
- [ ] Restore test (destructive; RUNBOOK **Backup / restore**):

```bash
set -a; source /opt/f1-tracker/infra/.env; set +a
/opt/f1-tracker/infra/ops/backup.sh list
/opt/f1-tracker/infra/ops/backup.sh restore <object-name> --confirm
```

- [ ] Utilisation vs the idle-reclaim rule (reclaimed if over 7 days the 95th
      percentile of CPU **and** network **and** memory are all < 20%): OCI
      console -> Instance -> Metrics, plus RUNBOOK **Measuring utilisation**.

## 8. Routine ops

- [ ] **Refresh F1 token** (~every 4 days, before each race weekend):
      `gh secret set F1_TOKEN --env production && gh workflow run deploy.yml`,
      then `docker compose exec scheduler cat /data/token-status.json` on the VM.
- [ ] **Update**: merge to `main`; CI green triggers the deploy.
- [ ] **Rollback**: `gh workflow run deploy.yml -f image_tag=sha-<older short sha>`
      (checks out that commit and its images; `main` is unchanged).
- [ ] **Rebuild after reclaim**: RUNBOOK **Rebuild after reclaim** (fresh
      auth key from step 3), then `gh workflow run deploy.yml` and restore.

## 9. Close the SDD changes

- [ ] Ask the assistant: "run SDD verify and archive for `deploy-production`,
      `deploy-production-ops` and `deploy-production-hardening`".
