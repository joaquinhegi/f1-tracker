"""Pure historical-backfill logic: which finished session to ingest from the
F1 static archive, and when. No I/O.

Why: public OpenF1 rejects every free request while any session is live, and
the live recorder needs an F1TV token for car positions. The free static
archive (livetiming.formula1.com/static) publishes every topic of a session a
while after it ends, and OpenF1's historical ingestor turns it into the same
collections the query API serves. Ingesting it locally makes the self-hosted
API complete for past sessions.

Rules encoded here:
- A session becomes due `publish_delay` after its published end. The archive
  is not instant; until it is, the job reports "not published" and is retried
  every `retry_interval`.
- Automatic backfill only looks at sessions that ended less than
  `give_up_after` ago, so a fresh install never ingests a whole season on its
  own (that is the explicit `backfill` command).
- At most one historical job at a time, never while the live ingestor runs,
  and never right before a recording window opens (the live feed has priority
  for CPU and network).
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from typing import Dict, Iterable, List, Optional

from f1_scheduler.domain import DEFAULT_POLICY, SchedulingPolicy, Session, next_window_start

# Record states
PENDING = "pending"  # tried, archive not published yet or the job failed: retry
DONE = "done"
ABANDONED = "abandoned"  # still not ingested `give_up_after` the end: manual only

# Job outcomes reported by the HistoricalIngestor port
OUTCOME_DONE = "done"
OUTCOME_NOT_PUBLISHED = "not_published"
OUTCOME_FAILED = "failed"


@dataclass(frozen=True)
class BackfillPolicy:
    publish_delay: timedelta = timedelta(minutes=60)
    retry_interval: timedelta = timedelta(minutes=30)
    give_up_after: timedelta = timedelta(hours=48)
    # Do not start a job if a recording window opens sooner than this.
    window_guard: timedelta = timedelta(minutes=45)


DEFAULT_BACKFILL_POLICY = BackfillPolicy()


@dataclass(frozen=True)
class BackfillRecord:
    session_key: int
    status: str
    attempts: int = 0
    last_attempt: Optional[datetime] = None
    last_outcome: Optional[str] = None


Records = Dict[int, BackfillRecord]


def year_of(session: Session) -> int:
    """F1 archive folders are per season, and a season is a calendar year."""
    return session.date_start.year


def is_archivable(session: Session, now: datetime, policy: BackfillPolicy) -> bool:
    """Finished long enough ago for the archive to be published, and addressable."""
    return (
        not session.is_cancelled
        and session.meeting_key is not None
        and session.date_end + policy.publish_delay <= now
    )


def _retry_due(record: Optional[BackfillRecord], now: datetime, policy: BackfillPolicy) -> bool:
    if record is None:
        return True
    if record.status != PENDING:
        return False
    return record.last_attempt is None or now - record.last_attempt >= policy.retry_interval


def backfill_candidates(
    sessions: Iterable[Session],
    now: datetime,
    records: Records,
    policy: BackfillPolicy = DEFAULT_BACKFILL_POLICY,
) -> List[Session]:
    """Sessions the automatic backfill should ingest now, oldest end first."""
    unique = {s.session_key: s for s in sessions}
    due = [
        s
        for s in unique.values()
        if is_archivable(s, now, policy)
        and now - s.date_end < policy.give_up_after
        and _retry_due(records.get(s.session_key), now, policy)
    ]
    return sorted(due, key=lambda s: (s.date_end, s.session_key))


def next_backfill(
    sessions: Iterable[Session],
    now: datetime,
    records: Records,
    ingestor_running: bool,
    backfill_running: bool,
    policy: BackfillPolicy = DEFAULT_BACKFILL_POLICY,
    scheduling: SchedulingPolicy = DEFAULT_POLICY,
) -> Optional[Session]:
    """The session to backfill on this tick, if any (see module rules)."""
    if ingestor_running or backfill_running:
        return None
    sessions = list(sessions)
    upcoming = next_window_start(sessions, now, scheduling)
    if upcoming is not None and upcoming[1] - now < policy.window_guard:
        return None
    candidates = backfill_candidates(sessions, now, records, policy)
    return candidates[0] if candidates else None


def record_outcome(
    record: Optional[BackfillRecord],
    session: Session,
    outcome: str,
    now: datetime,
    policy: BackfillPolicy = DEFAULT_BACKFILL_POLICY,
) -> BackfillRecord:
    """New record after a job finished with `outcome`."""
    base = record or BackfillRecord(session.session_key, PENDING)
    attempts = base.attempts + 1
    if outcome == OUTCOME_DONE:
        status = DONE
    elif now - session.date_end >= policy.give_up_after:
        status = ABANDONED
    else:
        status = PENDING
    return replace(base, status=status, attempts=attempts, last_attempt=now, last_outcome=outcome)


def season_backfill_plan(
    sessions: Iterable[Session],
    now: datetime,
    records: Records,
    year: int,
    only_keys: Optional[Iterable[int]] = None,
    force: bool = False,
    policy: BackfillPolicy = DEFAULT_BACKFILL_POLICY,
) -> List[Session]:
    """Sessions the one-off `backfill` command ingests, in calendar order.

    Every archivable session of `year` (or only `only_keys`), skipping those
    already done unless `force`. Unlike the automatic path there is no age
    limit and no retry spacing: the operator asked for it.
    """
    wanted = set(only_keys) if only_keys else None
    unique = {s.session_key: s for s in sessions}
    plan = [
        s
        for s in unique.values()
        if year_of(s) == year
        and (wanted is None or s.session_key in wanted)
        and is_archivable(s, now, policy)
        and (force or getattr(records.get(s.session_key), "status", None) != DONE)
    ]
    return sorted(plan, key=lambda s: (s.date_start, s.session_key))
