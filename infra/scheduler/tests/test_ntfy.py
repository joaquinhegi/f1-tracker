from __future__ import annotations

import logging

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


def test_notify_failure_is_logged_without_leaking_the_topic(caplog):
    def fake_opener(request, timeout):
        raise OSError("network down")

    notifier = NtfyNotifier("super-secret-topic", opener=fake_opener)
    with caplog.at_level(logging.WARNING):
        notifier.notify("Ingestor crashed", "session 123 crashed")

    assert "ntfy notification failed" in caplog.text
    assert "super-secret-topic" not in caplog.text


def test_build_notifier_with_unset_topic_is_a_no_op_null_notifier():
    notifier = build_notifier(None)
    assert isinstance(notifier, NullNotifier)
    notifier.notify("Ingestor crashed", "session 123 crashed")  # no raise, no call


def test_build_notifier_with_blank_topic_is_also_a_null_notifier():
    assert isinstance(build_notifier("   "), NullNotifier)


def test_build_notifier_with_a_topic_returns_the_ntfy_notifier():
    notifier = build_notifier("my-topic")
    assert isinstance(notifier, NtfyNotifier)
