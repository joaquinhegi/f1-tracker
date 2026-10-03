from __future__ import annotations

import sys
from unittest.mock import patch

from f1_scheduler.__main__ import main
from f1_scheduler.adapters.json_cache import JsonFileAlertState
from f1_scheduler.adapters.ntfy import NullNotifier
from f1_scheduler.service import SchedulerService


def _set_common_env(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_CONNECTION_STRING", "mongodb://localhost/test")
    monkeypatch.setenv("SCHEDULE_CACHE_PATH", str(tmp_path / "schedule-cache.json"))
    monkeypatch.setenv("TOKEN_STATUS_PATH", str(tmp_path / "token-status.json"))
    monkeypatch.setenv("BACKFILL_STATE_PATH", str(tmp_path / "backfill-state.json"))
    monkeypatch.setenv("ALERT_STATE_PATH", str(tmp_path / "alert-state.json"))
    monkeypatch.setattr(sys, "argv", ["f1_scheduler"])


def test_main_builds_the_service_without_crashing(tmp_path, monkeypatch):
    _set_common_env(tmp_path, monkeypatch)
    with patch.object(SchedulerService, "run", lambda self, *a, **kw: None):
        main()


def test_main_wires_a_null_notifier_and_the_json_alert_state_store(tmp_path, monkeypatch):
    _set_common_env(tmp_path, monkeypatch)
    monkeypatch.delenv("NTFY_TOPIC", raising=False)
    captured = {}

    def fake_run(self, *_a, **_kw):
        captured["service"] = self

    with patch.object(SchedulerService, "run", fake_run):
        main()

    service = captured["service"]
    # Explicit wiring assertion (not just "construction did not crash"): with
    # NTFY_TOPIC unset, the composition root must wire a NullNotifier and a
    # real JsonFileAlertState, not swap or drop either adapter silently.
    assert isinstance(service._notifier, NullNotifier)
    assert isinstance(service._alert_state_store, JsonFileAlertState)
