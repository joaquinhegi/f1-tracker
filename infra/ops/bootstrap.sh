#!/usr/bin/env bash
# infra/ops/bootstrap.sh
#
# Idempotent VM bootstrap: Docker CE + the compose plugin, Tailscale
# (`up --ssh`, Funnel on port 3000), rclone, unattended-upgrades, and the
# systemd timers for watchdog.sh/backup.sh. Safe to re-run, including after a
# reclaim/rebuild. See RUNBOOK.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

source_env_file() {
  local env_file="${REPO_DIR}/infra/.env"
  if [ -f "${env_file}" ]; then
    log "sourcing ${env_file}"
    set -a
    # shellcheck source=/dev/null
    source "${env_file}"
    set +a
  else
    log "no ${env_file} yet, skipping (cloud-init runs before it exists)"
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "docker already installed, skipping"
    return
  fi
  log "installing Docker CE + compose plugin"
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
}

install_tailscale() {
  if ! command -v tailscale >/dev/null 2>&1; then
    log "installing tailscale"
    curl -fsSL https://tailscale.com/install.sh | sh
  fi
  if [ -n "${TAILSCALE_AUTHKEY:-}" ]; then
    tailscale up --ssh --authkey="${TAILSCALE_AUTHKEY}"
  else
    tailscale up --ssh
  fi
  # Persists in tailscaled state across reboots; safe to re-issue.
  tailscale funnel --bg 3000
}

install_rclone() {
  if command -v rclone >/dev/null 2>&1; then
    log "rclone already installed, skipping"
    return
  fi
  log "installing rclone"
  curl -fsSL https://rclone.org/install.sh | sh
}

configure_rclone_remote() {
  if rclone listremotes | grep -q '^oracleobjectstorage:$'; then
    return
  fi
  if [ -z "${OCI_NAMESPACE:-}" ] || [ -z "${OCI_COMPARTMENT:-}" ] || [ -z "${OCI_REGION:-}" ]; then
    log "WARN configure_rclone_remote: OCI_NAMESPACE/OCI_COMPARTMENT/OCI_REGION not set, skipping rclone remote setup (re-run bootstrap.sh after infra/.env is filled in)"
    return
  fi
  rclone config create oracleobjectstorage oracleobjectstorage \
    provider instance_principal_auth \
    namespace "${OCI_NAMESPACE}" \
    compartment "${OCI_COMPARTMENT}" \
    region "${OCI_REGION}"
}

install_unattended_upgrades() {
  if dpkg -s unattended-upgrades >/dev/null 2>&1; then
    log "unattended-upgrades already installed, skipping"
    return
  fi
  log "installing unattended-upgrades"
  apt-get update -y
  apt-get install -y unattended-upgrades
  dpkg-reconfigure -f noninteractive unattended-upgrades
}

install_systemd_units() {
  log "installing systemd timers for watchdog and backup"
  install -m 0644 "${SCRIPT_DIR}"/systemd/f1-tracker-*.service /etc/systemd/system/
  install -m 0644 "${SCRIPT_DIR}"/systemd/f1-tracker-*.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable --now f1-tracker-watchdog.timer f1-tracker-backup.timer
}

main() {
  source_env_file
  install_docker
  install_tailscale
  install_rclone
  configure_rclone_remote
  install_unattended_upgrades
  install_systemd_units
  log "bootstrap complete: cd ${REPO_DIR}/infra && docker compose up -d --no-build"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
