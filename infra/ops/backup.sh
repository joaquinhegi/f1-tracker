#!/usr/bin/env bash
# infra/ops/backup.sh
#
# Streams a `mongodump --archive --gzip` through `rclone rcat` to the OCI
# Object Storage bucket (instance-principal auth), logs the archive size, and
# prunes backups older than RETENTION_DAYS -- only after a successful upload.
# Also provides a `restore` subcommand. See RUNBOOK.md.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=infra/ops/lib.sh
source "${SCRIPT_DIR}/lib.sh"

: "${COMPOSE_FILE:=/opt/f1-tracker/infra/docker-compose.yml}"
: "${MONGO_SERVICE:=mongo}"
: "${RCLONE_REMOTE:=oracleobjectstorage}"
: "${RETENTION_DAYS:=7}"

usage() {
  cat >&2 <<'EOF'
Usage: backup.sh backup
       backup.sh list
       backup.sh restore <object-name> --confirm
EOF
}

require_bucket() {
  # A direct statement, not inside a command substitution: this is what
  # makes the `:?` failure actually abort the script (see RUNBOOK.md note).
  : "${RCLONE_BUCKET:?RCLONE_BUCKET must be set}"
}

remote_path() {
  printf '%s:%s' "${RCLONE_REMOTE}" "${RCLONE_BUCKET}"
}

mongo_container() {
  docker compose -f "${COMPOSE_FILE}" ps -q "${MONGO_SERVICE}"
}

cmd_backup() {
  local cid ts object remote size
  require_bucket
  remote=$(remote_path)
  ts="$(date -u +%Y%m%dT%H%M%SZ)"
  object="mongo-${ts}.archive.gz"
  cid=$(mongo_container)

  if [ -z "${cid}" ]; then
    log "ERROR backup: ${MONGO_SERVICE} container not found"
    state_set backup last_result unhealthy
    exit 1
  fi

  if ! docker exec "${cid}" mongodump --archive --gzip | rclone rcat "${remote}/${object}"; then
    log "ERROR backup: mongodump/rclone pipeline failed"
    state_set backup last_result unhealthy
    exit 1
  fi

  size=$(rclone size --json "${remote}/${object}" 2>/dev/null | grep -o '"bytes":[0-9]*' | head -1 | grep -o '[0-9]*')
  log "backup uploaded: ${object} (${size:-unknown} bytes)"

  prune_old "${remote}"
  state_set backup last_result healthy
}

prune_old() {
  local remote="$1"
  if ! rclone delete --min-age "${RETENTION_DAYS}d" "${remote}"; then
    log "WARN prune: rclone delete reported an error, next successful backup retries"
  fi
}

cmd_list() {
  require_bucket
  rclone lsf "$(remote_path)"
}

cmd_restore() {
  local object="${1:-}" confirm="${2:-}" cid remote
  if [ -z "${object}" ] || [ "${confirm}" != "--confirm" ]; then
    echo "Refusing to restore without an explicit object name and --confirm." >&2
    usage
    exit 2
  fi
  require_bucket
  remote=$(remote_path)
  cid=$(mongo_container)
  if [ -z "${cid}" ]; then
    log "ERROR restore: ${MONGO_SERVICE} container not found"
    exit 1
  fi
  log "restoring ${object} into ${MONGO_SERVICE} (--drop)"
  rclone cat "${remote}/${object}" | docker exec -i "${cid}" mongorestore --archive --gzip --drop
  log "restore complete: ${object}"
}

main() {
  local sub="${1:-}"
  case "${sub}" in
    backup) cmd_backup ;;
    list) cmd_list ;;
    restore)
      shift
      cmd_restore "$@"
      ;;
    *)
      usage
      exit 2
      ;;
  esac
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
