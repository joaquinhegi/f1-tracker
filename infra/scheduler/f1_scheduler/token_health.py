"""Pure F1TV token health checks. No I/O, never exposes the token itself.

What F1_TOKEN actually is:
- fastf1_livetiming (pinned in openf1/Dockerfile) reads F1_TOKEN and hands it
  verbatim to signalrcore as `access_token_factory`, i.e. it is sent as the
  bearer token of the livetiming SignalR connection.
- The f1viewer guide tells you to copy the *whole response* of
  `POST api.formula1.com/.../by-password`. That response is a JSON object whose
  `data.subscriptionToken` is the actual bearer token: a JWT (header.payload.signature,
  base64url) carrying an `exp` claim.

So users end up with either the bare JWT (what fastf1_livetiming wants) or the
JSON blob (which fastf1_livetiming would send as-is and fail). We accept both:
`extract_subscription_token` returns the JWT inside, and the ingestor runner
passes only that to the recorder. The `login-session` browser cookie is the same
JSON, URL-encoded, so it is accepted too.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from urllib.parse import unquote

# Token formats
MISSING = "missing"
JWT = "jwt"
JSON_RESPONSE = "json"  # by-password response / login-session cookie with a nested JWT
OPAQUE = "opaque"  # something we cannot decode

# Health states
STATE_MISSING = "missing"
STATE_UNKNOWN = "unknown"
STATE_EXPIRED = "expired"
STATE_EXPIRING = "expiring"  # still valid now, but expires before the window ends
STATE_VALID = "valid"


def _b64url_json(segment: str) -> Any:
    padded = segment + "=" * (-len(segment) % 4)
    return json.loads(base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8"))


def _looks_like_jwt(value: str) -> bool:
    parts = value.split(".")
    if len(parts) != 3 or not all(parts[:2]):
        return False
    try:
        header = _b64url_json(parts[0])
    except Exception:
        return False
    return isinstance(header, dict) and "alg" in header


def _find_subscription_token(obj: Any) -> Optional[str]:
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key.lower() == "subscriptiontoken" and isinstance(value, str):
                return value.strip()
        for value in obj.values():
            found = _find_subscription_token(value)
            if found:
                return found
    return None


def _strip_quotes(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
        return value[1:-1].strip()
    return value


def classify(raw: Optional[str]) -> str:
    """Format of the configured F1_TOKEN value."""
    value = _strip_quotes(raw or "")
    if not value:
        return MISSING
    if _looks_like_jwt(value):
        return JWT
    if extract_subscription_token(value):
        return JSON_RESPONSE
    return OPAQUE


def extract_subscription_token(raw: Optional[str]) -> Optional[str]:
    """The bearer JWT inside F1_TOKEN, or None if there is none we recognise."""
    value = _strip_quotes(raw or "")
    if not value:
        return None
    if _looks_like_jwt(value):
        return value
    for candidate in (value, unquote(value)):
        if not candidate.lstrip().startswith("{"):
            continue
        try:
            nested = _find_subscription_token(json.loads(candidate))
        except ValueError:
            continue
        if nested and _looks_like_jwt(nested):
            return nested
    return None


def token_expiry(raw: Optional[str]) -> Optional[datetime]:
    """`exp` of the token as an aware UTC datetime, or None if not decodable.

    The signature is NOT verified: this is only a freshness hint.
    """
    jwt = extract_subscription_token(raw)
    if jwt is None:
        return None
    try:
        exp = _b64url_json(jwt.split(".")[1]).get("exp")
        if isinstance(exp, bool) or not isinstance(exp, (int, float)):
            return None
        return datetime.fromtimestamp(exp, tz=timezone.utc)
    except Exception:
        return None


@dataclass(frozen=True)
class TokenHealth:
    state: str
    token_format: str
    expires_at: Optional[datetime]
    checked_at: datetime
    window_end: Optional[datetime]

    @property
    def needs_refresh(self) -> bool:
        return self.state in (STATE_EXPIRED, STATE_EXPIRING)

    def describe(self) -> str:
        exp = self.expires_at.isoformat() if self.expires_at else "unknown"
        if self.state == STATE_MISSING:
            return "F1_TOKEN is not set"
        if self.state == STATE_UNKNOWN:
            return f"F1_TOKEN expiry is unknown (format: {self.token_format}, not a decodable JWT)"
        if self.state == STATE_EXPIRED:
            return f"F1_TOKEN EXPIRED at {exp}"
        if self.state == STATE_EXPIRING:
            end = self.window_end.isoformat() if self.window_end else "?"
            return f"F1_TOKEN expires at {exp}, before the next recording window ends ({end})"
        return f"F1_TOKEN valid until {exp}"

    def to_dict(self) -> Dict[str, Any]:
        """Serializable status. Contains no part of the token."""

        def iso(value: Optional[datetime]) -> Optional[str]:
            return value.isoformat() if value else None

        return {
            "state": self.state,
            "token_format": self.token_format,
            "expires_at": iso(self.expires_at),
            "checked_at": iso(self.checked_at),
            "window_end": iso(self.window_end),
            "needs_refresh": self.needs_refresh,
            "message": self.describe(),
        }


def assess_token(
    raw: Optional[str], now: datetime, window_end: Optional[datetime] = None
) -> TokenHealth:
    """Health of F1_TOKEN at `now`, relative to the end of the next recording window."""
    token_format = classify(raw)
    expires_at = token_expiry(raw)
    if token_format == MISSING:
        state = STATE_MISSING
    elif expires_at is None:
        state = STATE_UNKNOWN
    elif expires_at <= now:
        state = STATE_EXPIRED
    elif window_end is not None and expires_at < window_end:
        state = STATE_EXPIRING
    else:
        state = STATE_VALID
    return TokenHealth(state, token_format, expires_at, now, window_end)
