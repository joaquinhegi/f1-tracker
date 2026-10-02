# Production Runtime Specification

## Purpose

Run the web app, OpenF1 API and MongoDB on one VM, expose only the web UI publicly, and build/publish arm64 container images from CI. Covers `web/Dockerfile`, the `web` Compose service, the Tailscale exposure boundary, and GHCR image publishing.

## Requirements

### Requirement: Web container image

CI MUST build the `web` image for the `linux/arm64` platform from a multi-stage `Dockerfile` using Next.js `output: "standalone"`. The built image MUST NOT contain the F1TV token, `NTFY_TOPIC`, or any other secret.

#### Scenario: CI build
- GIVEN a push to the main branch
- WHEN the images workflow runs
- THEN an arm64 `web` image is built, and no `.env` file or secret value is baked into any layer

### Requirement: Web service configuration

The `web` Compose service MUST bind to `127.0.0.1:3000` only, set `OPENF1_SELF_HOSTED_URL=http://api:8000`, mount `F1_CACHE_DIR` on a persistent volume, and reference its image by GHCR tag. It MUST expose a health signal reflecting its own liveness, independent of upstream (`api`, `mongo`) availability.

#### Scenario: Upstream down, web still live
- GIVEN the `api` service is unreachable
- WHEN the web service's health signal is checked
- THEN it still reports healthy, because the signal does not depend on upstream

#### Scenario: Default routing
- GIVEN the web service starts with compose defaults
- WHEN it resolves OpenF1 data
- THEN it reaches the `api` service over the Compose network at `http://api:8000`

### Requirement: Public exposure boundary

Only the `web` service MUST be reachable from the public internet, over Tailscale Funnel on port 443 at the tailnet's `*.ts.net` hostname. The `api` and `mongo` services MUST NOT be reachable from the public internet under any configuration. The VM MUST NOT expose any other public inbound port; SSH access MUST go over the tailnet only.

#### Scenario: Funnel serves only web
- GIVEN Tailscale Funnel is active
- WHEN a public client requests the `*.ts.net` hostname
- THEN the web UI is served, and the same hostname/port does not reach `api` or `mongo`

#### Scenario: Direct access to api blocked
- GIVEN the VM's public IP
- WHEN a client attempts to connect to the `api` or `mongo` port directly
- THEN the connection is refused or times out, because no public inbound rule exists for it

#### Scenario: SSH over tailnet only
- GIVEN an operator needs shell access
- WHEN they connect over SSH
- THEN the connection MUST go through the tailnet; no SSH port is reachable from the public internet

### Requirement: Image publishing

CI MUST build arm64 images for `web`, `api` and `scheduler` on free GitHub-hosted arm64 runners and push each to GHCR on merge to the main branch. The VM deploy procedure MUST pull published images rather than building locally.

#### Scenario: Pipeline publishes all three images
- GIVEN a merge to main
- WHEN the images workflow completes
- THEN GHCR has updated arm64 tags for `web`, `api` and `scheduler`

### Requirement: No secrets in source or images

The repository and every published image MUST contain no secret values (tokens, ntfy topic, credentials). CI MUST authenticate to GHCR using only `GITHUB_TOKEN`.

#### Scenario: Secret scan passes
- GIVEN the repository before its first commit
- WHEN a secret scan runs
- THEN it reports no findings, and `infra/.env` is confirmed untracked

### Requirement: First deploy starts empty

The first production deployment MUST start with an empty MongoDB database; no historical backfill MUST run as part of initial deployment.

#### Scenario: Fresh VM boot
- GIVEN a newly bootstrapped VM with no prior data
- WHEN the stack starts for the first time
- THEN `mongo` has no pre-existing collections, and no backfill job is triggered automatically
