from __future__ import annotations

from pathlib import Path

from f1_scheduler.adapters.json_cache import JsonFileAlertState


def test_alert_state_round_trips_through_the_file(tmp_path: Path):
    path = tmp_path / "alert-state.json"
    store = JsonFileAlertState(path)

    assert store.load() == {}

    store.save({"token": "expired", "backfill:5": "failed"})
    assert store.load() == {"token": "expired", "backfill:5": "failed"}


def test_alert_state_ignores_an_unreadable_file(tmp_path: Path):
    path = tmp_path / "alert-state.json"
    path.write_text("not json", encoding="utf-8")

    assert JsonFileAlertState(path).load() == {}
