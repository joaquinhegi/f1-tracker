"""Application service: wires the pure domain to the ports and runs the loop."""

from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Callable, List, Optional

from f1_scheduler.backfill import (
    DEFAULT_BACKFILL_POLICY,
    OUTCOME_FAILED,
    BackfillPolicy,
    next_backfill,
    record_outcome,
)
from f1_scheduler.domain import (
    DEFAULT_POLICY,
    Idle,
    Keep,
    SchedulingPolicy,
    Session,
    Start,
    Stop,
    current_or_next_window,
    decide,
    next_window_start,
    recording_window,
)
from f1_scheduler.ports import (
    BackfillStateStore,
    HistoricalIngestor,
    IngestorRunner,
    ScheduleCache,
    ScheduleSync,
    SessionSource,
    TokenStatusStore,
)
from f1_scheduler.token_health import STATE_MISSING, TokenHealth, assess_token

log = logging.getLogger(__name__)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SchedulerService:
    def __init__(
        self,
        source: SessionSource,
        cache: ScheduleCache,
        runner: IngestorRunner,
        sync: Optional[ScheduleSync] = None,
        policy: SchedulingPolicy = DEFAULT_POLICY,
        refresh_interval: timedelta = timedelta(minutes=30),
        sync_interval: timedelta = timedelta(hours=24),
        clock: Callable[[], datetime] = utc_now,
        token: Optional[str] = None,
        token_status: Optional[TokenStatusStore] = None,
        historical: Optional[HistoricalIngestor] = None,
        backfill_state: Optional[BackfillStateStore] = None,
        backfill_policy: BackfillPolicy = DEFAULT_BACKFILL_POLICY,
    ):
        self._source = source
        self._cache = cache
        self._runner = runner
        self._sync = sync
        self._policy = policy
        self._refresh_interval = refresh_interval
        self._sync_interval = sync_interval
        self._clock = clock
        self._token = token
        self._token_status = token_status
        self._token_checked = False
        self._historical = historical
        self._backfill_state = backfill_state
        self._backfill_policy = backfill_policy

        self._sessions: List[Session] = cache.load()
        self._last_refresh: Optional[datetime] = None
        self._last_sync: Optional[datetime] = None
        self._last_log_line: Optional[str] = None
        if self._sessions:
            log.info("Loaded %d sessions from cache", len(self._sessions))

    # --- schedule ----------------------------------------------------------

    def _refresh_schedule(self, now: datetime) -> None:
        if self._last_refresh and now - self._last_refresh < self._refresh_interval:
            return
        self._last_refresh = now
        try:
            sessions = self._source.fetch_sessions(now.year)
        except Exception as exc:
            log.warning(
                "Could not fetch schedule (%s); keeping %d known sessions",
                exc,
                len(self._sessions),
            )
            return
        if not sessions:
            log.warning("Schedule for %d is empty; keeping previous one", now.year)
            return
        self._sessions = sessions
        self._cache.save(sessions)
        log.info("Schedule refreshed: %d sessions for %d", len(sessions), now.year)

    def _sync_local_schedule(self, now: datetime) -> None:
        if self._sync is None:
            return
        if self._last_sync and now - self._last_sync < self._sync_interval:
            return
        self._last_sync = now
        try:
            self._sync.sync(now.year)
        except Exception as exc:
            log.warning("Local schedule sync failed (will retry later): %s", exc)

    # --- F1TV token health ----------------------------------------------------

    def check_token(self, now: datetime, window_end: Optional[datetime]) -> TokenHealth:
        """Log (and persist) the token health against a recording window end.

        Never logs the token itself, only its format and expiry.
        """
        health = assess_token(self._token, now, window_end)
        if health.needs_refresh:
            log.warning(
                "%s. Refresh it: edit infra/.env, then `docker compose up -d scheduler`",
                health.describe(),
            )
        elif health.state == STATE_MISSING:
            log.warning(
                "F1_TOKEN is not set: sessions will be ingested WITHOUT authenticated "
                "topics (live car telemetry and positions will be missing)"
            )
        else:
            log.info(health.describe())
        if self._token_status is not None:
            try:
                self._token_status.save(health.to_dict())
            except Exception as exc:
                log.warning("Could not write token status: %s", exc)
        return health

    def _check_token_at_startup(self, now: datetime) -> None:
        if self._token_checked:
            return
        self._token_checked = True
        window = current_or_next_window(self._sessions, now, self._policy)
        self.check_token(now, window[2] if window else None)

    # --- loop --------------------------------------------------------------

    def _log_once(self, line: str) -> None:
        if line != self._last_log_line:
            log.info(line)
            self._last_log_line = line

    def tick(self) -> None:
        now = self._clock()
        self._refresh_schedule(now)
        self._check_token_at_startup(now)

        decision = decide(
            self._sessions, now, self._runner.running_session_key(), self._policy
        )

        if isinstance(decision, Start):
            start, stop = recording_window(decision.session, self._policy)
            log.info(
                "Recording window open for %s [%s -> %s]",
                decision.session.label(),
                start.isoformat(),
                stop.isoformat(),
            )
            self.check_token(now, stop)
            self._runner.start(decision.session)
            self._last_log_line = None
        elif isinstance(decision, Stop):
            log.info("Stopping ingestor for session %s: %s", decision.session_key, decision.reason)
            self._runner.stop()
            self._last_log_line = None
        elif isinstance(decision, Keep):
            self._log_once(f"Recording session {decision.session_key}")
        elif isinstance(decision, Idle):
            upcoming = next_window_start(self._sessions, now, self._policy)
            if upcoming:
                session, start = upcoming
                self._log_once(
                    f"Idle. Next: {session.label()}, ingestor starts at {start.isoformat()}"
                )
            else:
                self._log_once("Idle. No upcoming sessions in the known schedule")

        # Run after the decision so a slow scrape never delays starting a recording.
        self._sync_local_schedule(now)
        self._tick_backfill(now)

    # --- historical backfill ---------------------------------------------------

    def _tick_backfill(self, now: datetime) -> None:
        if self._historical is None or self._backfill_state is None:
            return
        finished = self._historical.poll()
        # Re-read every tick: the one-off `backfill` command shares the file.
        records = self._backfill_state.load()
        if finished is not None:
            session, outcome = finished
            records[session.session_key] = record_outcome(
                records.get(session.session_key), session, outcome, now, self._backfill_policy
            )
            self._save_backfill(records)
        target = next_backfill(
            self._sessions,
            now,
            records,
            ingestor_running=self._runner.running_session_key() is not None,
            backfill_running=self._historical.running_session_key() is not None,
            policy=self._backfill_policy,
            scheduling=self._policy,
        )
        if target is not None:
            try:
                self._historical.start(target)
            except Exception as exc:
                log.warning("Could not start historical ingestion for %s: %s", target.label(), exc)
                records[target.session_key] = record_outcome(
                    records.get(target.session_key), target, OUTCOME_FAILED, now, self._backfill_policy
                )
                self._save_backfill(records)

    def _save_backfill(self, records) -> None:
        try:
            self._backfill_state.save(records)
        except Exception as exc:
            log.warning("Could not write backfill state: %s", exc)

    def run(self, poll_interval: timedelta, stop_event: threading.Event) -> None:
        log.info("Scheduler running (poll every %ss)", int(poll_interval.total_seconds()))
        try:
            while not stop_event.is_set():
                try:
                    self.tick()
                except Exception:
                    log.exception("Scheduler tick failed")
                stop_event.wait(poll_interval.total_seconds())
        finally:
            self._runner.stop()
            if self._historical is not None:
                self._historical.stop()
            log.info("Scheduler stopped")
