"""Pure alerting domain: which events to notify, deduped per state change.

Each tracked condition (the F1TV token, the live ingestor, one key per
backfill session) maps to either a bad-state name (e.g. "expired", "crashed",
"failed") or `None`/absent when healthy. `evaluate` compares the previously
persisted state per key against what is observed now and returns only the
alerts that cross a transition: into a bad state once, and a single recovery
notice when a previously-bad condition clears. No I/O lives here.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from f1_scheduler.backfill import ABANDONED, DONE, OUTCOME_FAILED

OK = "ok"  # sentinel recorded once a condition that was bad has recovered

_TITLES = {
    "expiring": "F1TV token expiring",
    "expired": "F1TV token expired",
    "crashed": "Ingestor crashed",
    "failed": "Backfill failed",
    "abandoned": "Backfill abandoned",
}


@dataclass(frozen=True)
class Alert:
    key: str
    state: str
    title: str
    message: str


def _title(state: str) -> str:
    return _TITLES.get(state, state)


def evaluate(
    prev: Dict[str, str], observed: Dict[str, Optional[str]]
) -> Tuple[Dict[str, str], List[Alert]]:
    """`prev` holds the last persisted state per key (a bad-state name, or
    `OK` once recovered). `observed[key]` is the bad-state name right now, or
    `None` when healthy. A key absent from `observed` is left untouched (no
    signal this tick). Returns the next state to persist and the alerts to
    send -- only for keys whose classification actually changed.
    """
    next_state = dict(prev)
    alerts: List[Alert] = []
    for key, bad_state in observed.items():
        current = bad_state or OK
        previous = prev.get(key, OK)
        if current == previous:
            continue
        next_state[key] = current
        if current != OK:
            alerts.append(Alert(key, current, _title(current), f"{_title(current)} ({key})"))
        else:
            alerts.append(
                Alert(key, OK, f"Recovered: {_title(previous)}", f"{key} is healthy again")
            )
    return next_state, alerts


def token_alert_state(token_state: str) -> Optional[str]:
    """Only expiry is alert-worthy; missing/unknown/valid need no notification."""
    return token_state if token_state in ("expiring", "expired") else None


def ingestor_alert_state(expected_key: Optional[int], running_key: Optional[int]) -> Optional[str]:
    """A crash is the runner going idle while a session was expected to be running."""
    return "crashed" if expected_key is not None and running_key is None else None


def backfill_alert_state(status: str, last_outcome: Optional[str]) -> Optional[str]:
    """`OK` on completion, "abandoned" when given up, "failed" while a retry is
    pending after a failed attempt. Any other in-progress state returns `None`
    for "no signal yet" rather than a premature recovery.
    """
    if status == DONE:
        return OK
    if status == ABANDONED:
        return ABANDONED
    if last_outcome == OUTCOME_FAILED:
        return "failed"
    return None
