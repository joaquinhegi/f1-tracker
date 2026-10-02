"""Ports: the interfaces the scheduling service depends on."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Protocol, Tuple

from f1_scheduler.backfill import BackfillRecord
from f1_scheduler.domain import Session


class SessionSource(Protocol):
    def fetch_sessions(self, year: int) -> List[Session]:
        """Return the season schedule. Raises on transport/parse errors."""
        ...


class ScheduleCache(Protocol):
    def load(self) -> List[Session]:
        """Last known schedule (empty list if none)."""
        ...

    def save(self, sessions: List[Session]) -> None:
        ...


class IngestorRunner(Protocol):
    def start(self, session: Session) -> None:
        ...

    def stop(self) -> None:
        ...

    def running_session_key(self) -> Optional[int]:
        """Session key of the live ingestor process, or None if none is alive."""
        ...


class TokenStatusStore(Protocol):
    def save(self, status: Dict[str, Any]) -> None:
        """Persist the latest token health (never contains the token)."""
        ...


class ScheduleSync(Protocol):
    def sync(self, year: int) -> None:
        """Populate the local OpenF1 database with meetings/sessions."""
        ...


class HistoricalIngestor(Protocol):
    """Runs at most one historical (static archive) ingestion job at a time."""

    def start(self, session: Session) -> None:
        ...

    def running_session_key(self) -> Optional[int]:
        """Session key of the job in progress, or None."""
        ...

    def poll(self) -> Optional[Tuple[Session, str]]:
        """(session, outcome) once a job has finished, exactly once; else None.

        Outcome is one of backfill.OUTCOME_DONE / OUTCOME_NOT_PUBLISHED / OUTCOME_FAILED.
        """
        ...

    def run(self, session: Session) -> str:
        """Run one job to completion (blocking) and return its outcome."""
        ...

    def stop(self) -> None:
        ...


class BackfillStateStore(Protocol):
    def load(self) -> Dict[int, BackfillRecord]:
        ...

    def save(self, records: Dict[int, BackfillRecord]) -> None:
        ...
