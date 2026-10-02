"""One-off historical backfill of a season (or chosen sessions).

    docker compose exec scheduler python -m f1_scheduler backfill --year 2026 --dry-run
    docker compose exec scheduler python -m f1_scheduler backfill --year 2026
    docker compose exec scheduler python -m f1_scheduler backfill --year 2026 --session 11727

Sessions run one after the other (each one is a separate historical job) and
the result is recorded in the same state file as the automatic backfill, so
an interrupted run resumes where it stopped and the scheduler never re-ingests
what this command finished.
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime
from typing import Callable, List, Optional, Sequence, TextIO

from f1_scheduler.backfill import (
    DEFAULT_BACKFILL_POLICY,
    OUTCOME_DONE,
    BackfillPolicy,
    record_outcome,
    season_backfill_plan,
)
from f1_scheduler.domain import Session, is_race_like
from f1_scheduler.ports import BackfillStateStore, HistoricalIngestor

log = logging.getLogger(__name__)

# Measured on this stack (see infra/README.md, "Historical backfill"): a 1 h
# practice (2026 Bahrain FP1) took 42 MB of MongoDB storage + indexes and
# ~1 min wall time; a race lasts ~2 h, so twice that.
ESTIMATE_MB = {"race": 90, "other": 45}
ESTIMATE_MINUTES = {"race": 2, "other": 1}


def _kind(session: Session) -> str:
    return "race" if is_race_like(session) else "other"


def estimate(plan: Sequence[Session]) -> tuple:
    """(megabytes, minutes) a plan is expected to cost."""
    mb = sum(ESTIMATE_MB[_kind(s)] for s in plan)
    minutes = sum(ESTIMATE_MINUTES[_kind(s)] for s in plan)
    return mb, minutes


def parse_args(argv: List[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="python -m f1_scheduler backfill", description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--year", type=int, required=True, help="Season to backfill")
    parser.add_argument("--session", type=int, action="append", dest="sessions",
                        help="Only this session_key (repeatable)")
    parser.add_argument("--force", action="store_true", help="Re-ingest sessions already done")
    parser.add_argument("--dry-run", action="store_true", help="Print the plan and the estimate, ingest nothing")
    return parser.parse_args(argv)


def run_backfill(
    args: argparse.Namespace,
    load_sessions: Callable[[int], List[Session]],
    state: BackfillStateStore,
    ingestor: HistoricalIngestor,
    clock: Callable[[], datetime],
    out: TextIO,
    policy: BackfillPolicy = DEFAULT_BACKFILL_POLICY,
) -> int:
    sessions = load_sessions(args.year)
    plan = season_backfill_plan(sessions, clock(), state.load(), args.year, args.sessions, args.force, policy)
    mb, minutes = estimate(plan)
    print(f"{len(plan)} session(s) to ingest for {args.year}; estimate ~{mb / 1024:.1f} GB, ~{minutes} min", file=out)
    for s in plan:
        print(f"  {s.date_start:%Y-%m-%d} {s.label()} meeting={s.meeting_key}", file=out)
    if args.dry_run or not plan:
        return 0

    failures = 0
    for index, session in enumerate(plan, start=1):
        print(f"[{index}/{len(plan)}] {session.label()}", file=out, flush=True)
        outcome = ingestor.run(session)
        records = state.load()  # the scheduler may have written meanwhile
        records[session.session_key] = record_outcome(records.get(session.session_key), session, outcome, clock(), policy)
        state.save(records)
        print(f"[{index}/{len(plan)}] {session.label()}: {outcome}", file=out, flush=True)
        failures += outcome != OUTCOME_DONE
    return 1 if failures else 0


def first_non_empty(*loaders: Callable[[int], List[Session]]) -> Callable[[int], List[Session]]:
    """Try each schedule source in order (public OpenF1 401s while a session is live)."""

    def load(year: int) -> List[Session]:
        last_error: Optional[Exception] = None
        for loader in loaders:
            try:
                sessions = loader(year)
                if sessions:
                    return sessions
            except Exception as exc:  # next source
                last_error = exc
                log.warning("Schedule source failed: %s", exc)
        if last_error:
            raise last_error
        return []

    return load
