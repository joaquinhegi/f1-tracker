from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from f1_scheduler.adapters.openf1_http import session_from_json
from f1_scheduler.domain import (
    Idle,
    Keep,
    SchedulingPolicy,
    Session,
    Start,
    Stop,
    decide,
    lead_time,
    next_window_start,
    recording_window,
    select_session,
    should_record,
)

UTC = timezone.utc
T0 = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)  # session start used across tests


def make(
    key: int = 1,
    name: str = "Race",
    type_: str = "Race",
    start: datetime = T0,
    duration: timedelta = timedelta(hours=2),
    cancelled: bool = False,
) -> Session:
    return Session(key, name, type_, start, start + duration, cancelled)


# --- lead time per session type --------------------------------------------


@pytest.mark.parametrize(
    "name,type_,expected_minutes",
    [
        ("Race", "Race", 60),
        ("Sprint", "Race", 60),
        ("Sprint", "Sprint", 60),  # defensive: older/other naming
        ("Qualifying", "Qualifying", 15),
        ("Sprint Qualifying", "Qualifying", 15),
        ("Sprint Shootout", "Qualifying", 15),
        ("Practice 1", "Practice", 15),
        ("Practice 3", "Practice", 15),
        ("Day 1", "Practice", 15),  # pre-season testing
    ],
)
def test_lead_time_per_session_type(name, type_, expected_minutes):
    assert lead_time(make(name=name, type_=type_)) == timedelta(minutes=expected_minutes)


def test_lead_time_is_case_and_whitespace_insensitive():
    assert lead_time(make(name=" sprint ", type_="RACE")) == timedelta(minutes=60)


# --- window boundaries ------------------------------------------------------


def test_race_window_uses_race_lead_and_buffer():
    start, stop = recording_window(make(duration=timedelta(hours=2)))
    assert start == T0 - timedelta(minutes=60)
    assert stop == T0 + timedelta(hours=2) + timedelta(minutes=60)


def test_practice_window_uses_other_lead_and_buffer():
    s = make(name="Practice 1", type_="Practice", duration=timedelta(hours=1))
    start, stop = recording_window(s)
    assert start == T0 - timedelta(minutes=15)
    assert stop == T0 + timedelta(hours=1) + timedelta(minutes=30)


def test_custom_policy_is_respected():
    policy = SchedulingPolicy(
        race_lead=timedelta(minutes=90),
        other_lead=timedelta(minutes=20),
        race_end_buffer=timedelta(0),
        other_end_buffer=timedelta(minutes=5),
    )
    start, stop = recording_window(make(), policy)
    assert start == T0 - timedelta(minutes=90)
    assert stop == T0 + timedelta(hours=2)


def test_window_is_half_open():
    s = make(name="Qualifying", type_="Qualifying", duration=timedelta(hours=1))
    start, stop = recording_window(s)
    assert not should_record(s, start - timedelta(seconds=1))
    assert should_record(s, start)
    assert should_record(s, stop - timedelta(seconds=1))
    assert not should_record(s, stop)


def test_cancelled_session_is_never_recorded():
    assert not should_record(make(cancelled=True), T0)


# --- selection and dedupe ---------------------------------------------------


def test_select_none_outside_any_window():
    assert select_session([make()], T0 - timedelta(hours=3)) is None


def test_duplicate_schedule_entries_collapse_to_one():
    a, b = make(key=7), make(key=7)
    assert select_session([a, b], T0).session_key == 7


def test_overlapping_windows_pick_earliest_start():
    quali = make(key=1, name="Sprint Qualifying", type_="Qualifying", duration=timedelta(hours=1))
    sprint = make(key=2, name="Sprint", type_="Race", start=T0 + timedelta(hours=1, minutes=30))
    now = T0 + timedelta(hours=1, minutes=10)  # quali buffer + sprint lead overlap
    assert should_record(quali, now) and should_record(sprint, now)
    assert select_session([sprint, quali], now).session_key == 1


# --- decide -----------------------------------------------------------------


def test_decide_starts_when_window_opens():
    s = make()
    assert decide([s], T0 - timedelta(minutes=60), None) == Start(s)


def test_decide_idle_before_window():
    assert decide([make()], T0 - timedelta(minutes=61), None) == Idle()


def test_decide_never_starts_second_ingestor_for_same_session():
    s = make(key=5)
    assert decide([s], T0, running_session_key=5) == Keep(5)


def test_decide_never_starts_while_another_ingestor_runs():
    quali = make(key=1, name="Sprint Qualifying", type_="Qualifying", duration=timedelta(hours=1))
    sprint = make(key=2, name="Sprint", type_="Race", start=T0 + timedelta(hours=1, minutes=30))
    now = T0 + timedelta(hours=1, minutes=10)
    assert decide([quali, sprint], now, running_session_key=1) == Keep(1)


def test_decide_stops_when_window_closes_then_starts_next():
    quali = make(key=1, name="Sprint Qualifying", type_="Qualifying", duration=timedelta(hours=1))
    sprint = make(key=2, name="Sprint", type_="Race", start=T0 + timedelta(hours=1, minutes=30))
    _, quali_stop = recording_window(quali)
    decision = decide([quali, sprint], quali_stop, running_session_key=1)
    assert isinstance(decision, Stop) and decision.session_key == 1
    assert decide([quali, sprint], quali_stop, running_session_key=None) == Start(sprint)


def test_decide_stops_if_session_vanishes_or_is_cancelled():
    assert isinstance(decide([], T0, running_session_key=9), Stop)
    assert isinstance(decide([make(key=9, cancelled=True)], T0, running_session_key=9), Stop)


def test_decide_restarts_after_crash_inside_window():
    s = make()
    # Runner reports no live process (it crashed) while the window is open.
    assert decide([s], T0 + timedelta(minutes=30), running_session_key=None) == Start(s)


def test_next_window_start_skips_open_and_cancelled():
    open_now = make(key=1)
    cancelled = make(key=2, start=T0 + timedelta(days=1), cancelled=True)
    upcoming = make(key=3, name="Practice 1", type_="Practice", start=T0 + timedelta(days=2))
    session, start = next_window_start([open_now, cancelled, upcoming], T0)
    assert session.session_key == 3
    assert start == upcoming.date_start - timedelta(minutes=15)


# --- parsing (adapter helper, pure) -----------------------------------------


def test_session_from_openf1_json():
    raw = {
        "session_key": 9999,
        "session_name": "Sprint",
        "session_type": "Race",
        "date_start": "2026-10-03T16:00:00+00:00",
        "date_end": "2026-10-03T17:00:00Z",
    }
    s = session_from_json(raw)
    assert s.session_key == 9999 and not s.is_cancelled
    assert s.date_start == datetime(2026, 10, 3, 16, 0, tzinfo=UTC)
    assert s.date_end.tzinfo is not None
    assert lead_time(s) == timedelta(minutes=60)
