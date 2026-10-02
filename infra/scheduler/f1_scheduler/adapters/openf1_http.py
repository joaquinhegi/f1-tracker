"""SessionSource adapter backed by the public OpenF1 REST API (free schedule data)."""

from __future__ import annotations

import json
import logging
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List

from f1_scheduler.domain import Session

log = logging.getLogger(__name__)


def parse_datetime(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def session_from_json(raw: Dict[str, Any]) -> Session:
    return Session(
        session_key=int(raw["session_key"]),
        session_name=str(raw.get("session_name") or ""),
        session_type=str(raw.get("session_type") or ""),
        date_start=parse_datetime(raw["date_start"]),
        date_end=parse_datetime(raw["date_end"]),
        is_cancelled=bool(raw.get("is_cancelled") or False),
        meeting_key=int(raw["meeting_key"]) if raw.get("meeting_key") is not None else None,
    )


class OpenF1HttpSessionSource:
    def __init__(self, base_url: str = "https://api.openf1.org", timeout: float = 20.0):
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout

    def fetch_sessions(self, year: int) -> List[Session]:
        query = urllib.parse.urlencode({"year": year})
        url = f"{self._base_url}/v1/sessions?{query}"
        request = urllib.request.Request(
            url, headers={"Accept": "application/json", "User-Agent": "f1-tracker-scheduler"}
        )
        with urllib.request.urlopen(request, timeout=self._timeout) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        if not isinstance(payload, list):
            raise ValueError(f"Unexpected response from {url}: {str(payload)[:200]}")

        sessions = []
        for raw in payload:
            try:
                sessions.append(session_from_json(raw))
            except (KeyError, ValueError, TypeError) as exc:
                log.warning("Skipping malformed session entry %s: %s", raw, exc)
        return sessions
