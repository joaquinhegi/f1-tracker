from __future__ import annotations

import sys
from unittest.mock import patch

from f1_scheduler.__main__ import main
from f1_scheduler.service import SchedulerService


def test_main_builds_the_service_without_crashing(tmp_path, monkeypatch):
    monkeypatch.setenv("MONGO_CONNECTION_STRING", "mongodb://localhost/test")
    monkeypatch.setenv("SCHEDULE_CACHE_PATH", str(tmp_path / "schedule-cache.json"))
    monkeypatch.setenv("TOKEN_STATUS_PATH", str(tmp_path / "token-status.json"))
    monkeypatch.setenv("BACKFILL_STATE_PATH", str(tmp_path / "backfill-state.json"))
    monkeypatch.setenv("ALERT_STATE_PATH", str(tmp_path / "alert-state.json"))
    monkeypatch.setattr(sys, "argv", ["f1_scheduler"])
    with patch.object(SchedulerService, "run", lambda self, *a, **kw: None):
        main()
