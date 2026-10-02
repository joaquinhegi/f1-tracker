from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from f1_scheduler.domain import Session
from f1_scheduler.service import SchedulerService

T0 = datetime(2026, 10, 4, 12, 0, tzinfo=timezone.utc)
RACE = Session(1, "Race", "Race", T0, T0 + timedelta(hours=2))


class FakeSource:
    def __init__(self, sessions=None, fail=False):
        self.sessions, self.fail, self.calls = sessions or [], fail, 0

    def fetch_sessions(self, year: int) -> List[Session]:
        self.calls += 1
        if self.fail:
            raise ConnectionError("offline")
        return self.sessions


class FakeCache:
    def __init__(self, sessions=None):
        self.sessions, self.saved = sessions or [], None

    def load(self):
        return list(self.sessions)

    def save(self, sessions):
        self.saved = list(sessions)


class FakeRunner:
    def __init__(self):
        self.key: Optional[int] = None
        self.starts: List[int] = []
        self.stops = 0

    def start(self, session):
        assert self.key is None, "second ingestor started"
        self.key = session.session_key
        self.starts.append(session.session_key)

    def stop(self):
        if self.key is not None:
            self.stops += 1
        self.key = None

    def running_session_key(self):
        return self.key


class Clock:
    def __init__(self, now):
        self.now = now

    def __call__(self):
        return self.now


def build(source, cache=None, clock=None):
    runner = FakeRunner()
    service = SchedulerService(
        source=source, cache=cache or FakeCache(), runner=runner, clock=clock
    )
    return service, runner


def test_full_lifecycle_starts_once_and_stops():
    clock = Clock(T0 - timedelta(minutes=61))
    service, runner = build(FakeSource([RACE]), clock=clock)

    for minutes in (-61, -60, -30, 0, 60, 179):
        clock.now = T0 + timedelta(minutes=minutes)
        service.tick()
    assert runner.starts == [1] and runner.key == 1

    clock.now = T0 + timedelta(minutes=180)  # end (2h) + race buffer (60m)
    service.tick()
    assert runner.key is None and runner.stops == 1
    service.tick()
    assert runner.starts == [1]


def test_falls_back_to_cached_schedule_when_api_down():
    clock = Clock(T0)
    service, runner = build(FakeSource(fail=True), cache=FakeCache([RACE]), clock=clock)
    service.tick()
    assert runner.starts == [1]


def test_successful_fetch_is_cached():
    cache = FakeCache()
    service, _ = build(FakeSource([RACE]), cache=cache, clock=Clock(T0 - timedelta(days=1)))
    service.tick()
    assert cache.saved == [RACE]


def test_blank_f1_token_is_removed_from_ingestor_env():
    from f1_scheduler.adapters.subprocess_runner import ingestor_env

    assert "F1_TOKEN" not in ingestor_env({"F1_TOKEN": "", "A": "1"})
    assert "F1_TOKEN" not in ingestor_env({"F1_TOKEN": "  "})
    assert ingestor_env({"F1_TOKEN": "x"})["F1_TOKEN"] == "x"


# --- F1TV token health ----------------------------------------------------------


class FakeTokenStatus:
    def __init__(self):
        self.saved = []

    def save(self, status):
        self.saved.append(status)


def _jwt(exp: datetime) -> str:
    import base64
    import json

    def enc(obj):
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")

    return f"{enc({'alg': 'RS256'})}.{enc({'exp': int(exp.timestamp())})}.sig"


def build_with_token(token, now):
    runner, store = FakeRunner(), FakeTokenStatus()
    service = SchedulerService(
        source=FakeSource([RACE]),
        cache=FakeCache(),
        runner=runner,
        clock=Clock(now),
        token=token,
        token_status=store,
    )
    return service, runner, store


def test_startup_warns_when_token_expires_before_next_window_ends(caplog):
    now = T0 - timedelta(days=1)
    token = _jwt(T0 + timedelta(hours=1))  # race window ends at T0 + 3h
    service, _, store = build_with_token(token, now)
    with caplog.at_level("WARNING"):
        service.tick()
    assert store.saved[0]["state"] == "expiring"
    assert "expires at" in caplog.text and "docker compose up -d scheduler" in caplog.text
    assert token not in caplog.text and token not in str(store.saved)


def test_startup_check_runs_once():
    service, _, store = build_with_token(_jwt(T0 + timedelta(days=2)), T0 - timedelta(days=1))
    service.tick()
    service.tick()
    assert len(store.saved) == 1 and store.saved[0]["state"] == "valid"


def test_warns_before_launching_ingestor_with_expired_token(caplog):
    window_open = T0 - timedelta(minutes=60)
    service, runner, store = build_with_token(_jwt(T0 - timedelta(hours=5)), window_open)
    with caplog.at_level("WARNING"):
        service.tick()
    assert runner.starts == [1]  # still records unauthenticated topics
    assert [s["state"] for s in store.saved] == ["expired", "expired"]
    assert "EXPIRED" in caplog.text


def test_missing_token_is_reported(caplog):
    service, _, store = build_with_token(None, T0 - timedelta(days=1))
    with caplog.at_level("WARNING"):
        service.tick()
    assert store.saved[0]["state"] == "missing"
    assert "F1_TOKEN is not set" in caplog.text


def test_token_status_store_failure_does_not_break_tick():
    class Broken:
        def save(self, status):
            raise OSError("read-only")

    runner = FakeRunner()
    service = SchedulerService(
        source=FakeSource([RACE]), cache=FakeCache(), runner=runner,
        clock=Clock(T0), token=None, token_status=Broken(),
    )
    service.tick()
    assert runner.starts == [1]
