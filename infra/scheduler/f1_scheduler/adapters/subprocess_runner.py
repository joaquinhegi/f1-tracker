"""Subprocess adapters: the OpenF1 real-time ingestor and the schedule scraper."""

from __future__ import annotations

import logging
import os
import signal
import subprocess
import sys
import time
from typing import Callable, Dict, List, Optional, Tuple

from f1_scheduler.backfill import OUTCOME_DONE, OUTCOME_FAILED, OUTCOME_NOT_PUBLISHED, year_of
from f1_scheduler.domain import Session
from f1_scheduler.token_health import JSON_RESPONSE, classify, extract_subscription_token

log = logging.getLogger(__name__)

INGESTOR_CMD = [sys.executable, "-m", "openf1.services.ingestor_livetiming.real_time.app"]


def ingestor_env(base: Dict[str, str]) -> Dict[str, str]:
    """Environment for the ingestor process.

    OpenF1 passes `--auth` to fastf1_livetiming whenever F1_TOKEN is *defined*
    (`os.getenv("F1_TOKEN") is not None`), and fastf1_livetiming then refuses
    an empty token and the recorder restarts forever. Compose turns an unset
    variable into "", so drop blank tokens to fall back to unauthenticated mode.
    A pasted by-password JSON response is reduced to its subscriptionToken.
    """
    env = dict(base)
    raw = env.get("F1_TOKEN", "")
    if not raw.strip():
        env.pop("F1_TOKEN", None)
    elif classify(raw) == JSON_RESPONSE:
        # fastf1_livetiming sends F1_TOKEN verbatim as the bearer token, so pass
        # only the subscriptionToken JWT, not the whole by-password JSON response.
        log.info("F1_TOKEN is a JSON response; passing its subscriptionToken to the ingestor")
        env["F1_TOKEN"] = extract_subscription_token(raw) or raw
    return env


class SubprocessIngestorRunner:
    """Runs at most one OpenF1 real-time ingestor process.

    The ingestor spawns its own `fastf1_livetiming` child, so it is started in
    a new process group and the whole group is signalled on stop.
    """

    def __init__(
        self,
        command: Optional[List[str]] = None,
        env: Optional[Dict[str, str]] = None,
        stop_grace_seconds: float = 20.0,
    ):
        self._command = command or INGESTOR_CMD
        self._env = ingestor_env(os.environ if env is None else env)
        self._grace = stop_grace_seconds
        self._proc: Optional[subprocess.Popen] = None
        self._session_key: Optional[int] = None

    def running_session_key(self) -> Optional[int]:
        if self._proc is None:
            return None
        code = self._proc.poll()
        if code is None:
            return self._session_key
        log.warning(
            "Ingestor for session %s exited on its own with code %s",
            self._session_key,
            code,
        )
        self._proc = None
        self._session_key = None
        return None

    def start(self, session: Session) -> None:
        if self.running_session_key() is not None:
            raise RuntimeError(
                f"Refusing to start a second ingestor (running for {self._session_key})"
            )
        log.info("Starting ingestor for %s: %s", session.label(), " ".join(self._command))
        self._proc = subprocess.Popen(
            self._command,
            env=self._env,
            start_new_session=True,  # own process group -> we can signal the children
        )
        self._session_key = session.session_key
        log.info("Ingestor started (pid=%s)", self._proc.pid)

    def stop(self) -> None:
        proc, key = self._proc, self._session_key
        if proc is None:
            return
        log.info("Stopping ingestor for session %s (pid=%s)", key, proc.pid)
        # SIGINT lets asyncio cancel tasks and clean up; escalate if it hangs.
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGKILL):
            if proc.poll() is not None:
                break
            try:
                os.killpg(proc.pid, sig)
            except ProcessLookupError:
                break
            try:
                proc.wait(timeout=self._grace)
            except subprocess.TimeoutExpired:
                log.warning("Ingestor did not exit after %s, escalating", sig.name)
        log.info("Ingestor stopped (exit code %s)", proc.poll())
        self._proc = None
        self._session_key = None


class OpenF1ScheduleSync:
    """Fills the local `meetings` and `sessions` collections using OpenF1's own
    scraper, so the self-hosted API can answer /v1/sessions and /v1/meetings
    (the real-time ingestor does not write these collections)."""

    def __init__(self, timeout_seconds: float = 600.0):
        self._timeout = timeout_seconds

    def sync(self, year: int) -> None:
        for command in ("ingest-meetings", "ingest-sessions"):
            cmd = [
                sys.executable,
                "-m",
                "openf1.services.f1_scraping.schedule",
                command,
                "--year",
                str(year),
            ]
            log.info("Syncing local schedule: %s", " ".join(cmd[2:]))
            subprocess.run(cmd, check=True, timeout=self._timeout)


HISTORICAL_JOB_CMD = [sys.executable, "-m", "f1_scheduler.historical_job"]
# Exit codes of f1_scheduler.historical_job
_OUTCOME_BY_EXIT_CODE = {0: OUTCOME_DONE, 3: OUTCOME_NOT_PUBLISHED}


def historical_outcome(exit_code: Optional[int]) -> str:
    return _OUTCOME_BY_EXIT_CODE.get(exit_code, OUTCOME_FAILED)


class SubprocessHistoricalIngestor:
    """HistoricalIngestor running `f1_scheduler.historical_job` in a subprocess.

    `start`/`poll` never block (the scheduler loop keeps ticking while a job
    downloads and processes the archive); `run` blocks (one-off command).
    A job that exceeds `max_runtime_seconds` is killed and counted as failed.
    """

    def __init__(
        self,
        command: Optional[List[str]] = None,
        max_runtime_seconds: float = 2 * 3600,
        monotonic: Callable[[], float] = time.monotonic,
    ):
        self._command = command or HISTORICAL_JOB_CMD
        self._max_runtime = max_runtime_seconds
        self._monotonic = monotonic
        self._proc: Optional[subprocess.Popen] = None
        self._session: Optional[Session] = None
        self._started_at = 0.0

    def _args(self, session: Session) -> List[str]:
        if session.meeting_key is None:
            raise ValueError(f"{session.label()} has no meeting_key")
        return self._command + [str(year_of(session)), str(session.meeting_key), str(session.session_key)]

    def start(self, session: Session) -> None:
        if self._proc is not None:
            raise RuntimeError(f"Historical job already running for {self._session.session_key}")
        log.info("Starting historical ingestion for %s", session.label())
        self._proc = subprocess.Popen(self._args(session), start_new_session=True)
        self._session = session
        self._started_at = self._monotonic()

    def running_session_key(self) -> Optional[int]:
        return self._session.session_key if self._proc is not None and self._session else None

    def poll(self) -> Optional[Tuple[Session, str]]:
        proc, session = self._proc, self._session
        if proc is None or session is None:
            return None
        code = proc.poll()
        if code is None:
            if self._monotonic() - self._started_at <= self._max_runtime:
                return None
            log.warning("Historical job for %s exceeded %ss, killing it", session.label(), self._max_runtime)
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            proc.wait()
            code = None
        self._proc, self._session = None, None
        outcome = historical_outcome(code)
        log.info("Historical ingestion for %s finished: %s (exit code %s)", session.label(), outcome, code)
        return session, outcome

    def run(self, session: Session) -> str:
        try:
            code = subprocess.run(self._args(session), timeout=self._max_runtime).returncode
        except subprocess.TimeoutExpired:
            code = None
        return historical_outcome(code)

    def stop(self) -> None:
        if self._proc is not None and self._proc.poll() is None:
            try:
                os.killpg(self._proc.pid, signal.SIGTERM)
                self._proc.wait(timeout=20)
            except (ProcessLookupError, subprocess.TimeoutExpired):
                pass
        self._proc, self._session = None, None
