"""ScheduleCache adapter persisting the last known schedule to a JSON file.

Lets the scheduler keep working if the public API is unreachable (or restricts
access during live sessions) right when the container restarts.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List

from f1_scheduler.adapters.openf1_http import parse_datetime, session_from_json
from f1_scheduler.backfill import BackfillRecord
from f1_scheduler.domain import Session

log = logging.getLogger(__name__)


class JsonFileScheduleCache:
    def __init__(self, path: Path):
        self._path = path

    def load(self) -> List[Session]:
        if not self._path.exists():
            return []
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            return [session_from_json(item) for item in raw]
        except Exception as exc:  # corrupt cache must never crash the scheduler
            log.warning("Ignoring unreadable schedule cache %s: %s", self._path, exc)
            return []

    def save(self, sessions: List[Session]) -> None:
        _atomic_write_json(self._path, [
            {
                "session_key": s.session_key,
                "session_name": s.session_name,
                "session_type": s.session_type,
                "date_start": s.date_start.isoformat(),
                "date_end": s.date_end.isoformat(),
                "is_cancelled": s.is_cancelled,
                "meeting_key": s.meeting_key,
            }
            for s in sessions
        ])


class JsonFileTokenStatus:
    """TokenStatusStore adapter: `/data/token-status.json` on the scheduler volume."""

    def __init__(self, path: Path):
        self._path = path

    def save(self, status: Dict[str, Any]) -> None:
        _atomic_write_json(self._path, status)


class JsonFileBackfillState:
    """BackfillStateStore adapter: `/data/backfill-state.json` on the scheduler volume.

    Shared by the scheduler loop and the one-off `backfill` command, so it is
    re-read before every decision and written atomically.
    """

    def __init__(self, path: Path):
        self._path = path

    def load(self) -> Dict[int, BackfillRecord]:
        if not self._path.exists():
            return {}
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            records = {}
            for item in raw:
                last = item.get("last_attempt")
                record = BackfillRecord(
                    session_key=int(item["session_key"]),
                    status=str(item["status"]),
                    attempts=int(item.get("attempts", 0)),
                    last_attempt=parse_datetime(last) if last else None,
                    last_outcome=item.get("last_outcome"),
                )
                records[record.session_key] = record
            return records
        except Exception as exc:  # a corrupt state file only costs a re-ingest
            log.warning("Ignoring unreadable backfill state %s: %s", self._path, exc)
            return {}

    def save(self, records: Dict[int, BackfillRecord]) -> None:
        _atomic_write_json(self._path, [
            {
                "session_key": r.session_key,
                "status": r.status,
                "attempts": r.attempts,
                "last_attempt": r.last_attempt.isoformat() if r.last_attempt else None,
                "last_outcome": r.last_outcome,
            }
            for r in sorted(records.values(), key=lambda r: r.session_key)
        ])


class JsonFileAlertState:
    """AlertStateStore adapter: `/data/alert-state.json` on the scheduler volume."""

    def __init__(self, path: Path):
        self._path = path

    def load(self) -> Dict[str, str]:
        if not self._path.exists():
            return {}
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            return {str(k): str(v) for k, v in raw.items()}
        except Exception as exc:  # a corrupt state file only costs one re-alert
            log.warning("Ignoring unreadable alert state %s: %s", self._path, exc)
            return {}

    def save(self, state: Dict[str, str]) -> None:
        _atomic_write_json(self._path, state)


def _atomic_write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), suffix=".tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)
    os.replace(tmp, path)
