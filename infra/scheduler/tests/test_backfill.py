from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from f1_scheduler.adapters.json_cache import JsonFileBackfillState
from f1_scheduler.adapters.subprocess_runner import historical_outcome
from f1_scheduler.backfill import (
    ABANDONED,
    DONE,
    OUTCOME_DONE,
    OUTCOME_FAILED,
    OUTCOME_NOT_PUBLISHED,
    PENDING,
    BackfillPolicy,
    BackfillRecord,
    backfill_candidates,
    next_backfill,
    record_outcome,
    season_backfill_plan,
)
from f1_scheduler.backfill_command import estimate, first_non_empty, parse_args, run_backfill
from f1_scheduler.domain import Session
from f1_scheduler.service import SchedulerService

UTC = timezone.utc
END = datetime(2026, 10, 2, 5, 30, tzinfo=UTC)  # FP1 end
POLICY = BackfillPolicy()


def fp(key=11727, end=END, meeting=1308, cancelled=False, name="Practice 1", type_="Practice") -> Session:
    return Session(key, name, type_, end - timedelta(hours=1), end, cancelled, meeting)


# --- candidates ------------------------------------------------------------------


def test_session_is_due_only_after_the_publish_delay():
    s = fp()
    assert backfill_candidates([s], END + timedelta(minutes=59), {}) == []
    assert backfill_candidates([s], END + timedelta(minutes=60), {}) == [s]


def test_skips_cancelled_done_and_unaddressable_sessions():
    now = END + timedelta(hours=2)
    done = fp(2)
    sessions = [fp(1, cancelled=True), done, fp(3, meeting=None)]
    records = {2: BackfillRecord(2, DONE, 1, now)}
    assert backfill_candidates(sessions, now, records) == []


def test_automatic_backfill_ignores_old_sessions():
    old = fp(1, end=END - timedelta(days=3))
    assert backfill_candidates([old], END + timedelta(hours=2), {}) == []


def test_pending_session_is_retried_after_the_retry_interval():
    s = fp()
    tried = END + timedelta(hours=1)
    records = {s.session_key: BackfillRecord(s.session_key, PENDING, 1, tried, OUTCOME_NOT_PUBLISHED)}
    assert backfill_candidates([s], tried + timedelta(minutes=29), records) == []
    assert backfill_candidates([s], tried + timedelta(minutes=30), records) == [s]


def test_candidates_are_oldest_end_first_and_deduplicated():
    a, b = fp(1, end=END), fp(2, end=END + timedelta(hours=3))
    assert backfill_candidates([b, a, a], END + timedelta(hours=5), {}) == [a, b]


# --- next_backfill guards ----------------------------------------------------------


def test_never_runs_alongside_the_live_ingestor_or_another_job():
    now = END + timedelta(hours=2)
    s = fp()
    assert next_backfill([s], now, {}, ingestor_running=True, backfill_running=False) is None
    assert next_backfill([s], now, {}, ingestor_running=False, backfill_running=True) is None
    assert next_backfill([s], now, {}, ingestor_running=False, backfill_running=False) == s


def test_waits_when_a_recording_window_opens_soon():
    now = END + timedelta(hours=2)
    # Next practice starts in 50 min -> its window opens in 35 min (< 45 min guard).
    upcoming = Session(9, "Practice 2", "Practice", now + timedelta(minutes=50), now + timedelta(minutes=110))
    assert next_backfill([fp(), upcoming], now, {}, False, False) is None
    later = Session(9, "Practice 2", "Practice", now + timedelta(hours=3), now + timedelta(hours=4))
    assert next_backfill([fp(), later], now, {}, False, False) == fp()


# --- outcomes ------------------------------------------------------------------------


def test_record_outcome_transitions():
    s = fp()
    soon = END + timedelta(hours=2)
    assert record_outcome(None, s, OUTCOME_DONE, soon).status == DONE
    pending = record_outcome(None, s, OUTCOME_NOT_PUBLISHED, soon)
    assert (pending.status, pending.attempts, pending.last_attempt) == (PENDING, 1, soon)
    again = record_outcome(pending, s, OUTCOME_FAILED, soon + timedelta(hours=1))
    assert (again.status, again.attempts, again.last_outcome) == (PENDING, 2, OUTCOME_FAILED)
    late = record_outcome(again, s, OUTCOME_NOT_PUBLISHED, END + POLICY.give_up_after)
    assert late.status == ABANDONED


def test_exit_codes_map_to_outcomes():
    assert historical_outcome(0) == OUTCOME_DONE
    assert historical_outcome(3) == OUTCOME_NOT_PUBLISHED
    assert historical_outcome(1) == OUTCOME_FAILED
    assert historical_outcome(None) == OUTCOME_FAILED  # killed / timed out


# --- season plan ------------------------------------------------------------------------


def test_season_plan_includes_old_sessions_and_skips_done_unless_forced():
    now = END + timedelta(hours=2)
    old, done, live = fp(1, end=END - timedelta(days=90)), fp(2), fp(3, end=now)
    other_year = fp(4, end=datetime(2025, 12, 7, 15, tzinfo=UTC))
    records = {2: BackfillRecord(2, DONE, 1, now)}
    sessions = [done, old, live, other_year]
    assert season_backfill_plan(sessions, now, records, 2026) == [old]
    assert season_backfill_plan(sessions, now, records, 2026, force=True) == [old, done]
    assert season_backfill_plan(sessions, now, records, 2026, only_keys=[2], force=True) == [done]


def test_estimate_distinguishes_races():
    race = fp(1, name="Race", type_="Race")
    mb, minutes = estimate([race, fp(2)])
    assert mb > 0 and minutes > 0
    assert estimate([race])[0] > estimate([fp(2)])[0]


# --- fakes -------------------------------------------------------------------------------


class MemoryState:
    def __init__(self, records=None):
        self.records = dict(records or {})
        self.saves = 0

    def load(self):
        return dict(self.records)

    def save(self, records):
        self.records = dict(records)
        self.saves += 1


class FakeHistorical:
    def __init__(self, outcomes=None):
        self.outcomes = list(outcomes or [])
        self.started: List[int] = []
        self.ran: List[int] = []
        self.current: Optional[Session] = None
        self.finished = False

    def start(self, session):
        assert self.current is None
        self.current = session
        self.started.append(session.session_key)

    def running_session_key(self):
        return self.current.session_key if self.current and not self.finished else None

    def poll(self):
        if self.current is None or not self.finished:
            return None
        session, self.current, self.finished = self.current, None, False
        return session, self.outcomes.pop(0)

    def run(self, session):
        self.ran.append(session.session_key)
        return self.outcomes.pop(0)

    def stop(self):
        self.current = None


class IdleRunner:
    def __init__(self, key=None):
        self.key = key

    def start(self, session):
        self.key = session.session_key

    def stop(self):
        self.key = None

    def running_session_key(self):
        return self.key


class StaticCache:
    def __init__(self, sessions):
        self.sessions = sessions

    def load(self):
        return list(self.sessions)

    def save(self, sessions):
        pass


class NoSource:
    def fetch_sessions(self, year):
        raise ConnectionError("offline")


def build_service(sessions, now, historical, state, runner=None):
    clock = {"now": now}
    service = SchedulerService(
        source=NoSource(), cache=StaticCache(sessions), runner=runner or IdleRunner(),
        clock=lambda: clock["now"], historical=historical, backfill_state=state,
    )
    return service, clock


# --- service integration ---------------------------------------------------------------------


def test_service_starts_one_job_and_records_its_outcome():
    s = fp()
    historical, state = FakeHistorical([OUTCOME_DONE]), MemoryState()
    service, clock = build_service([s], END + timedelta(hours=2), historical, state)

    service.tick()
    service.tick()
    assert historical.started == [11727]  # still running: no second start

    historical.finished = True
    clock["now"] += timedelta(minutes=10)
    service.tick()
    assert state.records[11727].status == DONE
    service.tick()
    assert historical.started == [11727]


def test_service_retries_a_session_not_yet_published():
    s = fp()
    historical, state = FakeHistorical([OUTCOME_NOT_PUBLISHED, OUTCOME_DONE]), MemoryState()
    service, clock = build_service([s], END + timedelta(hours=1), historical, state)
    service.tick()
    historical.finished = True
    service.tick()
    assert state.records[11727].status == PENDING and historical.started == [11727]

    clock["now"] += timedelta(minutes=30)
    service.tick()
    assert historical.started == [11727, 11727]


def test_service_does_not_backfill_while_recording():
    historical, state = FakeHistorical(), MemoryState()
    service, _ = build_service([fp()], END + timedelta(hours=2), historical, state, runner=IdleRunner(key=99))
    service._tick_backfill(END + timedelta(hours=2))
    assert historical.started == []


def test_service_records_a_failed_start():
    class Broken(FakeHistorical):
        def start(self, session):
            raise OSError("no such file")

    historical, state = Broken(), MemoryState()
    service, _ = build_service([fp()], END + timedelta(hours=2), historical, state)
    service.tick()
    assert state.records[11727].last_outcome == OUTCOME_FAILED


# --- backfill command ------------------------------------------------------------------------


def test_command_dry_run_prints_plan_and_ingests_nothing():
    out, historical = io.StringIO(), FakeHistorical()
    code = run_backfill(parse_args(["--year", "2026", "--dry-run"]), lambda y: [fp()], MemoryState(),
                        historical, lambda: END + timedelta(hours=2), out)
    assert code == 0 and historical.ran == []
    assert "1 session(s) to ingest for 2026" in out.getvalue() and "key=11727" in out.getvalue()


def test_command_runs_sessions_in_order_and_persists_each_outcome():
    a, b = fp(1, end=END - timedelta(days=7)), fp(2)
    state, historical = MemoryState(), FakeHistorical([OUTCOME_DONE, OUTCOME_FAILED])
    code = run_backfill(parse_args(["--year", "2026"]), lambda y: [b, a], state, historical,
                        lambda: END + timedelta(hours=2), io.StringIO())
    assert historical.ran == [1, 2]
    assert state.records[1].status == DONE and state.records[2].status == PENDING
    assert code == 1


def test_first_non_empty_falls_back_to_the_next_source():
    def failing(year):
        raise ConnectionError("401")

    assert first_non_empty(failing, lambda y: [], lambda y: [fp()])(2026) == [fp()]


# --- state file ---------------------------------------------------------------------------------


def test_json_backfill_state_round_trip(tmp_path):
    store = JsonFileBackfillState(tmp_path / "state.json")
    assert store.load() == {}
    record = BackfillRecord(11727, DONE, 2, END, OUTCOME_DONE)
    store.save({11727: record})
    assert store.load() == {11727: record}
    (tmp_path / "state.json").write_text("{not json")
    assert store.load() == {}


def test_schedule_json_carries_the_meeting_key():
    from f1_scheduler.adapters.openf1_http import session_from_json

    raw = {"session_key": 11727, "session_name": "Practice 1", "session_type": "Practice",
           "date_start": "2026-10-02T04:30:00+00:00", "date_end": "2026-10-02T05:30:00+00:00", "meeting_key": 1308}
    assert session_from_json(raw).meeting_key == 1308
    assert session_from_json({**raw, "meeting_key": None}).meeting_key is None
