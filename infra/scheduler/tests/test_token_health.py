from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import pytest

from f1_scheduler.adapters.subprocess_runner import ingestor_env
from f1_scheduler.token_health import (
    JSON_RESPONSE,
    JWT,
    MISSING,
    OPAQUE,
    STATE_EXPIRED,
    STATE_EXPIRING,
    STATE_MISSING,
    STATE_UNKNOWN,
    STATE_VALID,
    assess_token,
    classify,
    extract_subscription_token,
    token_expiry,
)

UTC = timezone.utc
NOW = datetime(2026, 10, 2, 9, 0, tzinfo=UTC)


def b64url(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def make_jwt(exp=None, **claims) -> str:
    payload = dict(claims)
    if exp is not None:
        payload["exp"] = int(exp.timestamp()) if isinstance(exp, datetime) else exp
    return f"{b64url({'alg': 'RS256', 'typ': 'JWT'})}.{b64url(payload)}.c2lnbmF0dXJl"


def by_password_response(jwt: str) -> str:
    """Shape of the api.formula1.com by-password response (trimmed)."""
    return json.dumps(
        {
            "SessionId": "abc",
            "PasswordIsTemporary": False,
            "Subscriber": {"FirstName": "A", "Id": 1},
            "Country": "ESP",
            "data": {"subscriptionStatus": "active", "subscriptionToken": jwt},
        }
    )


# --- format detection / extraction -------------------------------------------


def test_bare_jwt_is_detected_and_returned_as_is():
    jwt = make_jwt(NOW + timedelta(days=4))
    assert classify(jwt) == JWT
    assert extract_subscription_token(jwt) == jwt


def test_jwt_with_surrounding_quotes_and_whitespace():
    jwt = make_jwt(NOW + timedelta(days=4))
    assert extract_subscription_token(f'  "{jwt}"\n') == jwt


def test_json_response_yields_nested_subscription_token():
    jwt = make_jwt(NOW + timedelta(days=4))
    raw = by_password_response(jwt)
    assert classify(raw) == JSON_RESPONSE
    assert extract_subscription_token(raw) == jwt


def test_url_encoded_login_session_cookie_is_accepted():
    jwt = make_jwt(NOW + timedelta(days=4))
    raw = quote(json.dumps({"data": {"subscriptionToken": jwt}}))
    assert classify(raw) == JSON_RESPONSE
    assert extract_subscription_token(raw) == jwt


@pytest.mark.parametrize(
    "raw",
    ["not-a-token", "a.b.c", "{broken json", '{"data": {"subscriptionToken": "nope"}}', "x" * 500],
)
def test_undecodable_values_are_opaque_and_do_not_crash(raw):
    assert classify(raw) == OPAQUE
    assert extract_subscription_token(raw) is None
    assert token_expiry(raw) is None


@pytest.mark.parametrize("raw", [None, "", "   ", '""'])
def test_missing_token(raw):
    assert classify(raw) == MISSING
    assert assess_token(raw, NOW).state == STATE_MISSING


# --- expiry -------------------------------------------------------------------


def test_expiry_is_read_from_exp_claim():
    exp = datetime(2026, 10, 5, 12, 30, tzinfo=UTC)
    assert token_expiry(make_jwt(exp)) == exp


@pytest.mark.parametrize("exp", [None, "soon", True])
def test_jwt_without_numeric_exp_has_unknown_expiry(exp):
    jwt = make_jwt(exp) if exp is not None else make_jwt()
    assert token_expiry(jwt) is None
    assert assess_token(jwt, NOW).state == STATE_UNKNOWN


def test_jwt_with_garbage_payload_is_unknown():
    header = b64url({"alg": "RS256"})
    raw = f"{header}.%%%%.sig"
    assert assess_token(raw, NOW).state == STATE_UNKNOWN


# --- health states ------------------------------------------------------------


def test_expired_token():
    health = assess_token(make_jwt(NOW - timedelta(seconds=1)), NOW)
    assert health.state == STATE_EXPIRED and health.needs_refresh


def test_token_expiring_exactly_now_is_expired():
    assert assess_token(make_jwt(NOW), NOW).state == STATE_EXPIRED


def test_token_expiring_before_window_end_is_expiring():
    jwt = make_jwt(NOW + timedelta(hours=1))
    health = assess_token(jwt, NOW, window_end=NOW + timedelta(hours=3))
    assert health.state == STATE_EXPIRING and health.needs_refresh


def test_token_outliving_window_is_valid():
    jwt = make_jwt(NOW + timedelta(days=3))
    health = assess_token(jwt, NOW, window_end=NOW + timedelta(hours=3))
    assert health.state == STATE_VALID and not health.needs_refresh


def test_valid_without_known_window():
    assert assess_token(make_jwt(NOW + timedelta(minutes=5)), NOW).state == STATE_VALID


def test_json_response_token_health_uses_nested_jwt():
    raw = by_password_response(make_jwt(NOW - timedelta(days=1)))
    assert assess_token(raw, NOW).state == STATE_EXPIRED


def test_status_dict_never_contains_the_token():
    jwt = make_jwt(NOW + timedelta(days=1))
    for raw in (jwt, by_password_response(jwt)):
        dumped = json.dumps(assess_token(raw, NOW).to_dict())
        assert jwt not in dumped
        assert jwt.split(".")[1] not in dumped


# --- ingestor env -------------------------------------------------------------


def test_ingestor_env_passes_only_jwt_from_json_response():
    jwt = make_jwt(NOW + timedelta(days=1))
    env = ingestor_env({"F1_TOKEN": by_password_response(jwt), "X": "1"})
    assert env == {"F1_TOKEN": jwt, "X": "1"}


def test_ingestor_env_keeps_bare_jwt_and_opaque_values():
    jwt = make_jwt(NOW + timedelta(days=1))
    assert ingestor_env({"F1_TOKEN": jwt})["F1_TOKEN"] == jwt
    assert ingestor_env({"F1_TOKEN": "opaque"})["F1_TOKEN"] == "opaque"
