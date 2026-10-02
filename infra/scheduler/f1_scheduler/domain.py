"""Pure scheduling logic: which session to record, and when.

No I/O lives here. Everything is a function of the schedule, the current time
and the state of the (single) ingestor, so it can be unit tested exhaustively.

Key facts this model encodes:
- The F1 livetiming feed is one global stream. OpenF1's real-time ingestor
  records whatever is live and learns the session key from the `SessionInfo`
  topic, so we only ever need ONE ingestor process at a time.
- OpenF1 requires the ingestor to start >= 1h before races (and sprints) and
  >= 15 min before any other session.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Iterable, Optional, Tuple, Union

RACE_LIKE_NAMES = frozenset({"race", "sprint"})


@dataclass(frozen=True)
class Session:
    session_key: int
    session_name: str
    session_type: str
    date_start: datetime  # timezone-aware, UTC
    date_end: datetime  # timezone-aware, UTC
    is_cancelled: bool = False
    # Needed to address the session in the F1 static archive (historical backfill).
    meeting_key: Optional[int] = None

    def label(self) -> str:
        return f"{self.session_name} (key={self.session_key})"


@dataclass(frozen=True)
class SchedulingPolicy:
    race_lead: timedelta = timedelta(minutes=60)
    other_lead: timedelta = timedelta(minutes=15)
    # Races can overrun the published end (red flags, delays); give more slack.
    race_end_buffer: timedelta = timedelta(minutes=60)
    other_end_buffer: timedelta = timedelta(minutes=30)


DEFAULT_POLICY = SchedulingPolicy()


def is_race_like(session: Session) -> bool:
    """Race and Sprint need the long lead time.

    OpenF1 reports Sprints as session_type="Race", session_name="Sprint",
    while "Sprint Qualifying" has session_type="Qualifying".
    """
    return (
        session.session_type.strip().lower() == "race"
        or session.session_name.strip().lower() in RACE_LIKE_NAMES
    )


def lead_time(session: Session, policy: SchedulingPolicy = DEFAULT_POLICY) -> timedelta:
    return policy.race_lead if is_race_like(session) else policy.other_lead


def end_buffer(session: Session, policy: SchedulingPolicy = DEFAULT_POLICY) -> timedelta:
    return policy.race_end_buffer if is_race_like(session) else policy.other_end_buffer


def recording_window(
    session: Session, policy: SchedulingPolicy = DEFAULT_POLICY
) -> Tuple[datetime, datetime]:
    """Half-open interval [start, stop) during which the ingestor must run."""
    start = session.date_start - lead_time(session, policy)
    stop = session.date_end + end_buffer(session, policy)
    return start, stop


def should_record(
    session: Session, now: datetime, policy: SchedulingPolicy = DEFAULT_POLICY
) -> bool:
    if session.is_cancelled:
        return False
    start, stop = recording_window(session, policy)
    return start <= now < stop


def select_session(
    sessions: Iterable[Session],
    now: datetime,
    policy: SchedulingPolicy = DEFAULT_POLICY,
) -> Optional[Session]:
    """The session that should be recorded right now, if any.

    Duplicate entries (same session_key) collapse to one. If windows overlap,
    the session that starts first wins; the ingestor keeps following the live
    feed, so the next session is still captured.
    """
    unique = {s.session_key: s for s in sessions}
    candidates = [s for s in unique.values() if should_record(s, now, policy)]
    if not candidates:
        return None
    return min(candidates, key=lambda s: (s.date_start, s.session_key))


# --- Decisions -------------------------------------------------------------


@dataclass(frozen=True)
class Start:
    session: Session


@dataclass(frozen=True)
class Stop:
    session_key: int
    reason: str


@dataclass(frozen=True)
class Keep:
    session_key: int


@dataclass(frozen=True)
class Idle:
    pass


Decision = Union[Start, Stop, Keep, Idle]


def decide(
    sessions: Iterable[Session],
    now: datetime,
    running_session_key: Optional[int],
    policy: SchedulingPolicy = DEFAULT_POLICY,
) -> Decision:
    """Decide what the ingestor runner should do on this tick.

    `running_session_key` is the session the currently running ingestor was
    started for (None if no ingestor process is alive). Guarantees:
    - never returns Start while an ingestor is running (at most one process,
      so a session can never get two ingestors);
    - never interrupts a recording whose window is still open;
    - stops the ingestor once its session's window has closed, even if the
      session disappeared from (or was cancelled in) the schedule.
    """
    sessions = list(sessions)
    by_key = {s.session_key: s for s in sessions}

    if running_session_key is not None:
        current = by_key.get(running_session_key)
        if current is None:
            return Stop(running_session_key, "session no longer in schedule")
        if current.is_cancelled:
            return Stop(running_session_key, "session cancelled")
        if should_record(current, now, policy):
            return Keep(running_session_key)
        return Stop(running_session_key, "recording window closed")

    target = select_session(sessions, now, policy)
    if target is None:
        return Idle()
    return Start(target)


def next_window_start(
    sessions: Iterable[Session],
    now: datetime,
    policy: SchedulingPolicy = DEFAULT_POLICY,
) -> Optional[Tuple[Session, datetime]]:
    """The next upcoming (not yet open) recording window, for logging."""
    upcoming = []
    for s in sessions:
        if s.is_cancelled:
            continue
        start, _ = recording_window(s, policy)
        if start > now:
            upcoming.append((start, s.session_key, s))
    if not upcoming:
        return None
    start, _, session = min(upcoming)
    return session, start


def current_or_next_window(
    sessions: Iterable[Session],
    now: datetime,
    policy: SchedulingPolicy = DEFAULT_POLICY,
) -> Optional[Tuple[Session, datetime, datetime]]:
    """The recording window that is open now, else the next one to open."""
    sessions = list(sessions)
    target = select_session(sessions, now, policy)
    if target is None:
        upcoming = next_window_start(sessions, now, policy)
        if upcoming is None:
            return None
        target = upcoming[0]
    start, stop = recording_window(target, policy)
    return target, start, stop
