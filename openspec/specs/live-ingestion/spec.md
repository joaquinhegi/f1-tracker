# Live Ingestion Specification

## Purpose

Run self-hosted OpenF1 (MongoDB, query API, and a scheduler) that records live sessions inside their recording windows. It keeps the local schedule in sync, watches F1TV token health, and backfills finished sessions from F1's free static archive.

Sources: `infra/docker-compose.yml`, `infra/openf1/Dockerfile`, `infra/scheduler/f1_scheduler/**`, `infra/README.md`.

## Requirements

### Requirement: Services and MongoDB 7

The stack MUST run three services:
- `mongo`: `mongo:7`, data in the `mongo-data` volume, bound to `127.0.0.1:27017`;
- `api`: the OpenF1 query API on `127.0.0.1:8000`;
- `scheduler`: not exposed, state in the `scheduler-data` volume at `/data`.

MongoDB MUST stay on major version 7, because Mongo 8 crashes on Linux kernel ≥ 6.19 (SERVER-121912). The API and scheduler MUST wait for a healthy `mongo`. OpenF1 commits MUST be pinned (`OPENF1_SHA`, `FASTF1_LIVETIMING_SHA`). No MQTT broker is used.

#### Scenario: Upgrade attempt
- GIVEN someone changes the image to `mongo:8`
- WHEN the host kernel is 6.19 or newer
- THEN mongo crashes, which is why the image is pinned to 7

### Requirement: Schedule polling

The scheduler MUST tick every `POLL_SECONDS` (30 s). Every 30 min (`SCHEDULE_REFRESH_MINUTES`), it MUST refresh the current year's schedule from `https://api.openf1.org/v1/sessions?year=<current>`. A good schedule MUST be cached in `/data/schedule-cache.json` and loaded at startup. A failed or empty fetch MUST keep the previous schedule.

#### Scenario: Public API down
- GIVEN a cached schedule and public OpenF1 unreachable
- WHEN the refresh runs
- THEN the scheduler keeps deciding from the cached schedule

### Requirement: Recording windows and lead times

A session's recording window MUST be `[start − lead, end + buffer)`:
- Race-like (session type `Race`, or name `Race` / `Sprint`): lead 60 min, buffer 60 min.
- Everything else: lead 15 min, buffer 30 min.

These MUST be overridable with `LEAD_MINUTES_RACE`, `LEAD_MINUTES_OTHER`, `END_BUFFER_MINUTES_RACE` and `END_BUFFER_MINUTES_OTHER`. Cancelled sessions MUST never be recorded. When windows overlap, the session starting first MUST win, with ties broken by session key. Duplicate schedule entries MUST collapse.

#### Scenario: Sprint Qualifying
- GIVEN a session named "Sprint Qualifying" with type `Qualifying`
- WHEN its window is computed
- THEN it uses the 15 min lead and 30 min buffer

### Requirement: Single ingestor

At most one OpenF1 real-time ingestor MUST run at a time, because the livetiming feed is a single stream. On each tick the scheduler MUST act as follows:
- No ingestor running: start one for the selected session if a window is open, otherwise stay idle.
- Ingestor running: keep it while its session's window is open. Stop it when the window closes, the session is cancelled, or the session disappears from the schedule.

Starting a second ingestor MUST be refused. Stopping MUST signal the ingestor's process group with SIGINT, then SIGTERM, then SIGKILL. On shutdown the scheduler MUST stop the ingestor and any historical job.

#### Scenario: Window closes
- GIVEN an ingestor recording a practice session
- WHEN now reaches end + 30 min
- THEN the ingestor is stopped with reason "recording window closed"

### Requirement: Restart after crash

If the ingestor exits on its own while its window is still open, the scheduler MUST log the exit code and start a new ingestor on the next tick.

#### Scenario: Ingestor crash
- GIVEN an ingestor that exits with an error during a race window
- WHEN the next tick runs
- THEN a new ingestor is started for the same session

### Requirement: F1TV token handling and health

`F1_TOKEN` MAY be a bare JWT, the whole `by-password` JSON response, or the URL-encoded `login-session` cookie. Only the nested `subscriptionToken` JWT MUST be passed to the recorder. A blank token MUST be removed from the ingestor environment, so the recorder runs unauthenticated instead of restarting forever. The token itself MUST never be logged or persisted.

Token health MUST be checked at startup and right before each ingestor start, against the window end. The token's JWT `exp` is decoded without verifying the signature. The resulting state MUST be one of:
- `missing`
- `unknown` (not decodable)
- `expired`
- `expiring` (valid now, expires before the window end)
- `valid`

The state MUST be logged (WARNING for `expired`/`expiring`, and for `missing`). It MUST be written to `/data/token-status.json` with `state`, `token_format`, `expires_at`, `checked_at`, `window_end`, `needs_refresh` and `message`.

#### Scenario: Token expires mid-weekend
- GIVEN a JWT expiring before the race window ends
- WHEN the ingestor is about to start
- THEN a WARNING "F1_TOKEN expires at …, before the next recording window ends" is logged and `state` is `expiring`

### Requirement: Local schedule sync

When `SYNC_LOCAL_SCHEDULE` is true (the default), the scheduler MUST run OpenF1's `f1_scraping.schedule ingest-meetings` and `ingest-sessions` once a day, after the recording decision. These fill the local `/v1/meetings` and `/v1/sessions`, which the ingestor does not write. A sync failure MUST be logged and retried later.

#### Scenario: Fresh install
- GIVEN an empty local database
- WHEN the scheduler's first tick runs
- THEN the local schedule endpoints are populated for the current year

### Requirement: Automatic historical backfill

When `BACKFILL_ENABLED` is true (the default), on each tick the scheduler MUST start at most one historical job, as a subprocess, for the oldest-ending due session. A session is due when all of these hold:
- it is not cancelled;
- it has a `meeting_key`;
- it ended at least `BACKFILL_PUBLISH_DELAY_MINUTES` (60) ago;
- it ended less than `BACKFILL_GIVE_UP_MINUTES` (2880 = 48 h) ago;
- it is new, or `pending` with its last attempt at least `BACKFILL_RETRY_MINUTES` (30) ago.

No job MUST start while the live ingestor or another job runs, or when a recording window opens within 45 min. Job outcomes MUST map from exit codes:
- 0: `done`
- 3: archive not published yet
- anything else, or a timeout: `failed`

A job running longer than 2 h MUST be killed. Records in `/data/backfill-state.json` MUST be `done`, `pending` or `abandoned`, with attempt count, last attempt and last outcome. A non-`done` outcome recorded 48 h or more after the session end MUST mark the session `abandoned`. Sessions that ended 48 h ago or more MUST no longer be picked automatically. A failure to start a job MUST be recorded as `failed`. The state file MUST be re-read every tick, because the one-off command shares it.

#### Scenario: Archive not published yet
- GIVEN a session that ended 65 min ago
- WHEN its job exits with code 3
- THEN the record is `pending` and the job is retried 30 min later

#### Scenario: Race weekend guard
- GIVEN a qualifying recording window opening in 30 min
- WHEN a backfill is due
- THEN no job is started this tick

### Requirement: Historical job rules

A historical job MUST ingest one session from `livetiming.formula1.com/static` using OpenF1's own historical ingestor. A session missing from the archive index MUST exit with code 3. Before ingesting, the job MUST ensure indexes:
- `(session_key, date)` on the time-ranged collections: location, car_data, intervals, position, team_radio, race_control, weather, pit, overtakes;
- `session_key` on drivers, laps and stints.

After ingesting, it MUST delete older copies of that session (`_id` < job start in ms), but only in collections the archive produced documents for. Re-running a job MUST therefore be idempotent. A job that ingested zero documents MUST exit as failed.

#### Scenario: Replacing a partial live recording
- GIVEN a session with a partial live recording in `laps`
- WHEN its historical job ingests the archive
- THEN the older live `laps` documents are deleted and the archive's remain

### Requirement: Backfill command

`python -m f1_scheduler backfill --year <Y> [--session <key>]... [--force] [--dry-run]` MUST plan every archivable session of year Y in calendar order. Only the given keys are planned when `--session` is passed. Sessions already `done` MUST be skipped unless `--force`. Unlike the automatic path, it applies no age limit and no retry spacing.

The command MUST print the plan and an estimate: 45 MB / 1 min per session and 90 MB / 2 min per race-like session. With `--dry-run` it MUST ingest nothing. Otherwise it MUST run the sessions one after the other, recording each outcome in the shared state file. An interrupted run therefore resumes. It MUST exit 1 if any session did not end `done`. The schedule MUST be loaded from public OpenF1, falling back to the local API.

#### Scenario: Dry run
- GIVEN `backfill --year 2026 --dry-run`
- WHEN it runs
- THEN it prints the session list and "~X GB, ~Y min" and ingests nothing

## Known limitations

- Without `F1_TOKEN`, nothing is recorded live. The legacy unauthenticated SignalR endpoint answers 401, and a websockets 12 incompatibility kills the client. Sessions become available about an hour after they end, through the backfill. Whether SignalR Core streams anything without a token is unproven.
- Tokens expire about every 4 days and must be refreshed by hand (edit `infra/.env`, then `docker compose up -d scheduler`).
- Season-scale cost (~5–7 GB, ~2–2.5 h) is extrapolated from one measured session (2026 Bahrain FP1: 798,322 documents, 42 MB). The estimate undercounts ~8 h testing days.
- Live recording with a valid token has not been verified end to end in this deployment.
