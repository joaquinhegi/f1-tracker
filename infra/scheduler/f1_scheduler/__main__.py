"""Entry point. Configuration comes from env vars.

    python -m f1_scheduler                         # scheduler loop (container default)
    python -m f1_scheduler backfill --year 2026    # one-off historical backfill
"""

from __future__ import annotations

import logging
import os
import signal
import sys
import threading
from datetime import timedelta
from pathlib import Path

from f1_scheduler.adapters.json_cache import (
    JsonFileBackfillState,
    JsonFileScheduleCache,
    JsonFileTokenStatus,
)
from f1_scheduler.adapters.ntfy import build_notifier
from f1_scheduler.adapters.openf1_http import OpenF1HttpSessionSource
from f1_scheduler.adapters.subprocess_runner import (
    OpenF1ScheduleSync,
    SubprocessHistoricalIngestor,
    SubprocessIngestorRunner,
)
from f1_scheduler.backfill import BackfillPolicy
from f1_scheduler.backfill_command import first_non_empty, parse_args, run_backfill
from f1_scheduler.domain import SchedulingPolicy
from f1_scheduler.service import utc_now
from f1_scheduler.service import SchedulerService


def _minutes(name: str, default: int) -> timedelta:
    return timedelta(minutes=int(os.getenv(name, str(default))))


def _flag(name: str, default: bool) -> bool:
    return os.getenv(name, str(default)).strip().lower() in {"1", "true", "yes", "on"}


def _backfill_policy() -> BackfillPolicy:
    return BackfillPolicy(
        publish_delay=_minutes("BACKFILL_PUBLISH_DELAY_MINUTES", 60),
        retry_interval=_minutes("BACKFILL_RETRY_MINUTES", 30),
        give_up_after=_minutes("BACKFILL_GIVE_UP_MINUTES", 48 * 60),
    )


def _backfill_state() -> JsonFileBackfillState:
    return JsonFileBackfillState(Path(os.getenv("BACKFILL_STATE_PATH", "/data/backfill-state.json")))


def backfill_main(argv) -> int:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s [backfill] %(message)s")
    public = OpenF1HttpSessionSource(os.getenv("SCHEDULE_API_URL", "https://api.openf1.org"))
    local = OpenF1HttpSessionSource(os.getenv("LOCAL_API_URL", "http://api:8000"))
    return run_backfill(
        parse_args(argv),
        load_sessions=first_non_empty(public.fetch_sessions, local.fetch_sessions),
        state=_backfill_state(),
        ingestor=SubprocessHistoricalIngestor(),
        clock=utc_now,
        out=sys.stdout,
        policy=_backfill_policy(),
    )


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "backfill":
        sys.exit(backfill_main(sys.argv[2:]))

    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s [scheduler] %(message)s",
    )
    log = logging.getLogger("f1_scheduler")

    if not os.getenv("MONGO_CONNECTION_STRING"):
        log.warning("MONGO_CONNECTION_STRING is not set: the ingestor cannot store data")

    policy = SchedulingPolicy(
        race_lead=_minutes("LEAD_MINUTES_RACE", 60),
        other_lead=_minutes("LEAD_MINUTES_OTHER", 15),
        race_end_buffer=_minutes("END_BUFFER_MINUTES_RACE", 60),
        other_end_buffer=_minutes("END_BUFFER_MINUTES_OTHER", 30),
    )

    service = SchedulerService(
        source=OpenF1HttpSessionSource(os.getenv("SCHEDULE_API_URL", "https://api.openf1.org")),
        cache=JsonFileScheduleCache(
            Path(os.getenv("SCHEDULE_CACHE_PATH", "/data/schedule-cache.json"))
        ),
        runner=SubprocessIngestorRunner(),
        sync=OpenF1ScheduleSync() if _flag("SYNC_LOCAL_SCHEDULE", True) else None,
        policy=policy,
        refresh_interval=_minutes("SCHEDULE_REFRESH_MINUTES", 30),
        token=os.getenv("F1_TOKEN"),
        token_status=JsonFileTokenStatus(
            Path(os.getenv("TOKEN_STATUS_PATH", "/data/token-status.json"))
        ),
        historical=SubprocessHistoricalIngestor() if _flag("BACKFILL_ENABLED", True) else None,
        backfill_state=_backfill_state(),
        backfill_policy=_backfill_policy(),
        notifier=build_notifier(os.getenv("NTFY_TOPIC")),
        alert_state=JsonFileAlertState(Path(os.getenv("ALERT_STATE_PATH", "/data/alert-state.json"))),
        token_check_interval=_minutes("TOKEN_CHECK_MINUTES", 360),
    )

    stop_event = threading.Event()

    def _handle_signal(signum, _frame):
        log.info("Received signal %s, shutting down", signal.Signals(signum).name)
        stop_event.set()

    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    service.run(timedelta(seconds=int(os.getenv("POLL_SECONDS", "30"))), stop_event)


if __name__ == "__main__":
    main()
