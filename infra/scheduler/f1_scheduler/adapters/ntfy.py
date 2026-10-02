"""Notifier adapter: push notifications via ntfy.sh.

Posts to `{server}/{topic}`. The topic is the only secret here (an unlisted
channel, not an auth token) and must never be logged -- only `notify()`'s
title/message, which callers control, ever leaves this module in a log line.
"""

from __future__ import annotations

import logging
import urllib.error
import urllib.request
from typing import Callable, Optional

log = logging.getLogger(__name__)

DEFAULT_SERVER = "https://ntfy.sh"

Opener = Callable[[urllib.request.Request, float], object]


class NtfyNotifier:
    """Notifier port implementation posting to a configured ntfy.sh topic."""

    def __init__(
        self,
        topic: str,
        server: str = DEFAULT_SERVER,
        opener: Optional[Opener] = None,
        timeout_seconds: float = 10.0,
    ):
        if not topic:
            raise ValueError("NtfyNotifier requires a non-empty topic")
        self._topic = topic
        self._server = server.rstrip("/")
        self._opener = opener or urllib.request.urlopen
        self._timeout = timeout_seconds

    def notify(self, title: str, message: str) -> None:
        request = urllib.request.Request(
            f"{self._server}/{self._topic}",
            data=message.encode("utf-8"),
            headers={"Title": title},
            method="POST",
        )
        try:
            response = self._opener(request, self._timeout)
            close = getattr(response, "__exit__", None)
            if close is not None:
                close(None, None, None)
        except (urllib.error.URLError, OSError) as exc:
            log.warning("ntfy notification failed: %s", exc)


class NullNotifier:
    """No-op Notifier used when no channel is configured."""

    def notify(self, title: str, message: str) -> None:
        return None


def build_notifier(topic: Optional[str]) -> "NtfyNotifier | NullNotifier":
    """Selects the Notifier adapter: `NullNotifier` when no topic is configured."""
    value = (topic or "").strip()
    if not value:
        return NullNotifier()
    return NtfyNotifier(value)
