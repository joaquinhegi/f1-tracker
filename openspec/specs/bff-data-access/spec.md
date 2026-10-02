# BFF Data Access Specification

## Purpose

The browser talks only to this app's BFF (`/api/*`). The BFF routes each query to self-hosted or public OpenF1, caches and rate-limits upstream calls, validates windows, and maps failures to a stable error envelope.

Sources: `web/src/app/api/**`, `web/src/composition/server-container.ts`, `web/src/shared/f1-data/**`, `web/src/shared/http/**`, `web/src/shared/cache/ttl-cache.ts`, `web/src/shared/time/time-window.ts`, `web/src/shared/config/server-config.ts`, `web/src/shared/ui/hooks/use-bff-resource.ts`.

## Requirements

### Requirement: Endpoints

The BFF MUST expose these GET endpoints:

| Endpoint | Returns |
|---|---|
| `/api/weekend/current` | `WeekendOverviewDto` |
| `/api/circuits/:circuitKey/outline` | `CircuitOutlineDto` (transform, path, raw points, start/finish, `pitLane` or null, `sectors` or null, source) |
| `/api/sessions/:sessionKey/drivers` | `SessionDriversDto` |
| `/api/sessions/:sessionKey/locations?from&to` | `LocationWindowDto`: every car, flat `[msSinceFrom, x, y, ...]` per driver, sorted, `(0, 0)` dropped, one upstream call |
| `/api/sessions/:sessionKey/timing` | `SessionTimingDto` (laps, stints, positions, pit stops) |
| `/api/sessions/:sessionKey/intervals?from&to` | `IntervalWindowDto`, gaps parsed to `{kind:"time",seconds}` / `{kind:"laps",laps}` |
| `/api/sessions/:sessionKey/team-radio` | `TeamRadioDto`, each message with its lap |

`sessionKey` and `circuitKey` MUST be positive integers, otherwise the BFF MUST answer `400 bad_request`.

#### Scenario: Invalid session key
- GIVEN `GET /api/sessions/abc/drivers`
- WHEN the request is handled
- THEN the BFF answers 400 with code `bad_request`

### Requirement: Window validation

Windowed endpoints MUST require `from` and `to` as ISO 8601 timestamps. Both MUST be multiples of 5 s. `to` MUST be after `from` and at most 120 s later. Any violation MUST answer `400 bad_request` with a message naming the rule. Windows are `[from, to)`.

#### Scenario: Unaligned window
- GIVEN `from=…T10:00:02Z`
- WHEN the request is handled
- THEN the BFF answers 400 "from and to must be multiples of 5 s"

#### Scenario: Oversized window
- GIVEN a 180 s window
- WHEN the request is handled
- THEN the BFF answers 400

### Requirement: Error envelope

Errors MUST be `{ "error": { "code", "message" } }`, sent with `Cache-Control: no-store`:

| Status | Code | When |
|---|---|---|
| 400 | `bad_request` | invalid key or window |
| 404 | `outline_unavailable` | no outline could be built |
| 404 | `no_meeting` | no meeting this year or next |
| 502 | `upstream_error` | upstream non-OK answer |
| 502 | `upstream_unreachable` | any other failure (network, timeout) |
| 503 | `rate_limited` | the rate-limiter queue wait would exceed its maximum. `Retry-After` is the expected wait in seconds, rounded up |
| 503 | `upstream_restricted` | public OpenF1 answered 401 "live F1 session" and no local data stood in. Sent with `Retry-After: 300` |

#### Scenario: Public restricted during a live session
- GIVEN a historical session not stored locally while another session is live
- WHEN its timing is requested
- THEN the BFF answers 503 `upstream_restricted` with `Retry-After: 300`

### Requirement: Routing between self-hosted and public OpenF1

The schedule (meetings, sessions) MUST be asked from self-hosted first. It MUST fall back to public when the local answer is empty or self-hosted fails. Session data MUST be served from self-hosted when either holds:
- the session is live, meaning inside the recorder window: Race/Sprint [start − 60 min, end + 60 min), others [start − 15 min, end + 30 min);
- the session is stored locally, meaning self-hosted has a non-empty driver list for it.

Otherwise session data MUST go to public. For a locally served session, an empty or failed local answer MUST be completed from public. If public then fails, the (possibly empty) local answer MUST stand. The local-presence probe MUST be memoized for 10 min when found and 60 s when not found. The memo is cleared when it exceeds 500 sessions. A public "live session" 401 MUST be remembered for 60 s, during which public calls fail fast with the same error.

#### Scenario: Session backfilled while the app runs
- GIVEN a session probed as not stored locally
- WHEN it is backfilled and 60 s pass
- THEN its next request is served from self-hosted

#### Scenario: Local data with public restricted
- GIVEN a locally stored session whose laps are empty locally, while public is restricted
- WHEN laps are requested
- THEN the empty local answer is returned instead of an error

### Requirement: Upstream rate limiting

Each upstream MUST have a FIFO token-bucket limiter that never exceeds its limit in any sliding window:
- Self-hosted: 28 requests / 10 s (burst 8), 8 s timeout, 10 s maximum queue wait.
- Public: 3 requests / s (burst 1) and 30 requests / min (burst 6), 15 s timeout, 20 s maximum queue wait.

A caller whose expected wait exceeds the maximum MUST be rejected immediately with `rate_limited`. An upstream `404 "No results found."` MUST be treated as an empty result. The container (provider, caches, limiters) MUST be created once per server process, including across dev reloads.

#### Scenario: Burst of viewers
- GIVEN 40 distinct uncached public requests arrive at once
- WHEN they are sent
- THEN at most 30 reach public OpenF1 in any minute, and callers past the 20 s queue get `rate_limited`

### Requirement: Cache TTLs

Caching MUST work on three levels. Upstream answers MUST be cached with in-flight coalescing, so concurrent identical requests share one upstream call. Failed loads MUST NOT be cached.

| Level | Live | Otherwise | Other entries |
|---|---|---|---|
| Upstream answers | 2 s | 1 h | schedule 10 min |
| Session DTOs (memo) | 1 s | 5 min | weekend overview 15 s, outline 60 s |
| Browser `Cache-Control` | see below | see below | see below |

Browser `Cache-Control` values:
- live session data: `public, max-age=1`;
- finished session data: `public, max-age=300, stale-while-revalidate=3600`;
- windowed data of a finished session: `public, max-age=86400, immutable`;
- a live session's window that ended more than 60 s ago: `max-age=300, stale-while-revalidate=3600`;
- weekend: `max-age=15, stale-while-revalidate=60`;
- outline: `max-age=3600, stale-while-revalidate=86400`.

#### Scenario: Finished window
- GIVEN a locations window of a finished session
- WHEN it is served
- THEN `Cache-Control` is `public, max-age=86400, immutable`

### Requirement: Client retries and offline handling

Browser fetches MUST retry failures with exponential backoff: 2 s, 4 s, 8 s and so on, capped at 30 s. A `Retry-After` header MUST be honoured, capped at 5 min. While the browser is offline, nothing MUST be requested. A request MUST start again on reconnect. The last good data MUST stay on screen during errors (stale-while-error). Requests that never got an answer MUST surface as code `network`.

#### Scenario: Rate limited
- GIVEN a BFF answer `503 rate_limited` with `Retry-After: 4`
- WHEN the client retries
- THEN it waits 4 s, and keeps showing the last data meanwhile

### Requirement: Configuration

The server MUST read these settings, with defaults:
- `OPENF1_SELF_HOSTED_URL`, default `http://127.0.0.1:8000`;
- `OPENF1_PUBLIC_URL`, default `https://api.openf1.org`;
- `F1_CACHE_DIR`, default `<cwd>/.cache`.

#### Scenario: No env file
- GIVEN no environment variables are set
- WHEN the server starts
- THEN it uses the local infra API and public OpenF1

## Known limitations

- The `400` response of the outline endpoint is sent without `Cache-Control: no-store`, unlike the other error responses.
- The live check and the stored-locally check cost one schedule lookup and one driver probe per session, each cached.
