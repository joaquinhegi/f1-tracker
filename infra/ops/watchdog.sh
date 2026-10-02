#!/usr/bin/env bash
# infra/ops/watchdog.sh
#
# Runs every 2 minutes (via the f1-tracker-watchdog.timer systemd unit).
# Compares web/api/mongo/scheduler container health, plus the last backup
# result, against the previous run and alerts once per state change, with
# recovery notices. See RUNBOOK.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/ops/lib.sh
source "${SCRIPT_DIR}/lib.sh"

: "${COMPOSE_FILE:=/opt/f1-tracker/infra/docker-compose.yml}"

# container_health SERVICE -> "healthy" if the compose service is up and its
# healthcheck (or run state, when it has none) reports healthy/running.
container_health() {
  local service="$1" cid status
  cid=$(docker compose -f "${COMPOSE_FILE}" ps -q "${service}" 2>/dev/null || true)
  if [ -z "${cid}" ]; then
    printf 'down'
    return
  fi
  status=$(docker inspect \
    --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
    "${cid}" 2>/dev/null || printf 'down')
  case "${status}" in
    healthy | running) printf 'healthy' ;;
    *) printf 'unhealthy' ;;
  esac
}

main() {
  local web api mongo scheduler backup
  web=$(container_health web)
  api=$(container_health api)
  mongo=$(container_health mongo)
  scheduler=$(container_health scheduler)
  backup=$(state_get backup last_result)

  check_and_alert "web" "${web}" "web service down" \
    "The web container is unhealthy or stopped."
  check_and_alert "api" "${api}" "api service down" \
    "The api container is unhealthy or stopped."
  check_and_alert "mongo" "${mongo}" "mongo service down" \
    "The mongo container is unhealthy or stopped."
  check_and_alert "scheduler" "${scheduler}" "scheduler service down" \
    "The scheduler container is unhealthy or stopped."
  check_and_alert "backup" "${backup}" "backup failed" \
    "The latest backup job did not complete successfully."

  log "watchdog check complete: web=${web} api=${api} mongo=${mongo} scheduler=${scheduler} backup=${backup}"
}

main "$@"
