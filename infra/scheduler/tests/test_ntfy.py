from __future__ import annotations

import logging
import urllib.error
import urllib.request

import pytest

from f1_scheduler.adapters.ntfy import NtfyNotifier, NullNotifier, build_notifier


class FakeResponse:
    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


def test_notify_posts_title_and_message_to_the_topic_url():
    captured = {}

    def fake_opener(request, timeout):
        captured["url"] = request.full_url
        captured["headers"] = dict(request.headers)
        captured["data"] = request.data
        captured["timeout"] = timeout
        return FakeResponse()

    notifier = NtfyNotifier("super-secret-topic", opener=fake_opener)
    notifier.notify("Token expiring", "F1_TOKEN expires in 2 hours")

    assert captured["url"] == "https://ntfy.sh/super-secret-topic"
    assert captured["headers"]["Title"] == "Token expiring"
    assert captured["data"] == b"F1_TOKEN expires in 2 hours"


def test_notify_raises_on_urlerror_without_leaking_the_topic(caplog):
    def fake_opener(request, timeout):
        raise OSError("network down")

    notifier = NtfyNotifier("super-secret-topic", opener=fake_opener)
    with caplog.at_level(logging.WARNING):
        with pytest.raises(OSError, match="network down"):
            notifier.notify("Ingestor crashed", "session 123 crashed")

    assert "ntfy notification failed" in caplog.text
    assert "super-secret-topic" not in caplog.text


def test_notify_raises_on_http_error_too():
    def fake_opener(request, timeout):
        raise urllib.error.HTTPError(request.full_url, 503, "Service Unavailable", {}, None)

    notifier = NtfyNotifier("super-secret-topic", opener=fake_opener)
    with pytest.raises(urllib.error.HTTPError):
        notifier.notify("Backup failed", "nightly backup failed")


def test_build_notifier_with_unset_topic_is_a_no_op_that_makes_no_network_call(monkeypatch):
    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("NullNotifier must not make a network call")

    monkeypatch.setattr(urllib.request, "urlopen", fail_if_called)

    notifier = build_notifier(None)
    assert isinstance(notifier, NullNotifier)
    notifier.notify("Ingestor crashed", "session 123 crashed")  # no raise, no call


def test_build_notifier_with_blank_topic_is_also_a_no_op_that_makes_no_network_call(monkeypatch):
    def fail_if_called(*_args, **_kwargs):
        raise AssertionError("NullNotifier must not make a network call")

    monkeypatch.setattr(urllib.request, "urlopen", fail_if_called)

    notifier = build_notifier("   ")
    notifier.notify("Ingestor crashed", "session 123 crashed")  # no raise, no call


def test_build_notifier_with_a_topic_returns_a_notifier_that_posts_to_ntfy(monkeypatch):
    called = {}

    def fake_urlopen(request, timeout=None):
        called["url"] = request.full_url
        called["timeout"] = timeout
        return FakeResponse()

    monkeypatch.setattr(urllib.request, "urlopen", fake_urlopen)

    notifier = build_notifier("my-topic")
    assert isinstance(notifier, NtfyNotifier)
    notifier.notify("Scheduler alert", "something happened")

    assert called["url"] == "https://ntfy.sh/my-topic"
