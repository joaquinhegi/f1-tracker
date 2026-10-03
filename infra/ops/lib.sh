#!/usr/bin/env bash
# infra/ops/lib.sh
#
# Shared helpers for watchdog.sh and backup.sh: journald-friendly logging, an
# ntfy notifier that is a silent no-op without NTFY_TOPIC, and a tiny
# per-component state store used to dedupe alerts across runs. Sourced, never
# executed directly.
set -euo pipefail

: "${STATE_DIR:=/var/lib/f1-tracker/alerts}"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

# ntfy_notify TITLE MESSAGE [PRIORITY] [TAGS]
# No-op, with no network call, when NTFY_TOPIC is unset or blank. Never logs
# or includes the topic, and the caller must never pass a secret in MESSAGE.
ntfy_notify() {
  local title="$1" message="$2" priority="${3:-default}" tags="${4:-}"
  if [ -z "${NTFY_TOPIC:-}" ]; then
    return 0
  fi
  local -a headers=(-H "Title: ${title}" -H "Priority: ${priority}")
  if [ -n "${tags}" ]; then
    headers+=(-H "Tags: ${tags}")
  fi
  if ! curl -fsS --max-time 10 "${headers[@]}" -d "${message}" \
      "https://ntfy.sh/${NTFY_TOPIC}" >/dev/null; then
    log "WARN ntfy_notify failed for: ${title}"
  fi
}

# state_get COMPONENT KEY -> prints the stored value, or "unknown" if unset.
state_get() {
  local component="$1" key="$2"
  local file="${STATE_DIR}/${component}/${key}.state"
  if [ -f "${file}" ]; then
    head -c 4096 "${file}"
  else
    printf 'unknown'
  fi
}

# state_set COMPONENT KEY VALUE -> persists VALUE, creating STATE_DIR as needed.
state_set() {
  local component="$1" key="$2" value="$3"
  local dir="${STATE_DIR}/${component}"
  mkdir -p "${dir}"
  printf '%s' "${value}" >"${dir}/${key}.state"
}

# check_and_alert KEY CURRENT TITLE MESSAGE
# CURRENT is "healthy" or anything else (treated as unhealthy/unknown).
# Fires TITLE once on entering a non-healthy state, a recovery notice once on
# returning to "healthy", and nothing while the state is unchanged.
check_and_alert() {
  local key="$1" current="$2" title="$3" message="$4" prev
  prev=$(state_get "watchdog" "${key}")
  if [ "${current}" = "healthy" ]; then
    if [ "${prev}" != "healthy" ] && [ "${prev}" != "unknown" ]; then
      ntfy_notify "Recovered: ${title}" "${message}" "default"
    fi
  elif [ "${prev}" != "${current}" ]; then
    ntfy_notify "${title}" "${message}" "high"
  fi
  state_set "watchdog" "${key}" "${current}"
}
