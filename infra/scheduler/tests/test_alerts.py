from __future__ import annotations

from f1_scheduler.alerts import (
    OK,
    backfill_alert_state,
    evaluate,
    ingestor_alert_state,
    token_alert_state,
)


def test_evaluate_fires_once_for_a_new_token_expired_state():
    state, alerts = evaluate({}, {"token": "expired"})
    assert state == {"token": "expired"}
    assert len(alerts) == 1
    assert alerts[0].key == "token" and alerts[0].state == "expired"


def test_evaluate_fires_once_for_a_new_ingestor_crash():
    state, alerts = evaluate({}, {"ingestor": "crashed"})
    assert state == {"ingestor": "crashed"}
    assert [a.key for a in alerts] == ["ingestor"]


def test_evaluate_fires_once_for_a_new_backfill_failure():
    state, alerts = evaluate({}, {"backfill:5": "failed"})
    assert state == {"backfill:5": "failed"}
    assert [a.key for a in alerts] == ["backfill:5"]


def test_evaluate_does_not_repeat_while_the_bad_state_is_unchanged():
    prev = {"token": "expired"}
    state, alerts = evaluate(prev, {"token": "expired"})
    assert state == prev
    assert alerts == []


def test_evaluate_sends_a_recovery_alert_when_healthy_again():
    prev = {"token": "expiring"}
    state, alerts = evaluate(prev, {"token": None})
    assert state == {"token": OK}
    assert len(alerts) == 1 and alerts[0].state == OK


def test_evaluate_sends_no_alert_for_an_already_healthy_condition():
    state, alerts = evaluate({}, {"token": None})
    assert state == {}
    assert alerts == []


def test_token_alert_state_only_flags_expiring_and_expired():
    assert token_alert_state("expiring") == "expiring"
    assert token_alert_state("expired") == "expired"
    assert token_alert_state("valid") is None
    assert token_alert_state("missing") is None
    assert token_alert_state("unknown") is None


def test_ingestor_alert_state_flags_a_crash_only_when_expected_but_not_running():
    assert ingestor_alert_state(expected_key=7, running_key=None) == "crashed"
    assert ingestor_alert_state(expected_key=7, running_key=7) is None
    assert ingestor_alert_state(expected_key=None, running_key=None) is None


def test_backfill_alert_state_maps_status_to_alert_states():
    assert backfill_alert_state("done", None) == OK
    assert backfill_alert_state("abandoned", "failed") == "abandoned"
    assert backfill_alert_state("pending", "failed") == "failed"
    assert backfill_alert_state("pending", "not_published") is None
