# Self-hosted OpenF1

Runs [OpenF1](https://github.com/br-g/openf1) locally with Docker Compose. It records live F1 sessions from the official livetiming feed and serves them through OpenF1's own query API.

| Service     | What it does                                                                 | Exposed              |
|-------------|------------------------------------------------------------------------------|----------------------|
| `mongo`     | MongoDB 7, data in the `mongo-data` volume                                   | `127.0.0.1:27017`    |
| `api`       | OpenF1 query API (`uvicorn openf1.services.query_api.app:app`)               | `127.0.0.1:8000`     |
| `scheduler` | Starts OpenF1's real-time ingestor around each session and stops it afterwards | not exposed        |

No MQTT broker: OpenF1 only uses MQTT to push live updates to subscribers. Ingestion writes straight to MongoDB.

## 1. Get an F1TV token (optional, recommended)

You need an F1TV subscription. Follow
[Getting your subscription token](https://github.com/SoMuchForSubtlety/f1viewer/wiki/Getting-your-subscription-token).

Without a token, nothing is recorded live: the unauthenticated feed endpoint now refuses connections (see "Live recording without an F1TV token"). Finished sessions are still filled in from the free static archive about an hour after they end (see "Historical backfill").

**Tokens expire about every 4 days.** Refresh the token before each race weekend, then run `docker compose up -d scheduler` again.

What to paste into `F1_TOKEN`: the guide copies the whole `by-password` JSON response. The real bearer token is its `data.subscriptionToken`, a JWT (`eyJ...`). Either works: the scheduler passes only the JWT to the recorder.

### Token health

The scheduler decodes the JWT's `exp` (no signature check) and never logs the token itself. It checks at startup and again right before launching the ingestor:

- `WARNING ... F1_TOKEN EXPIRED at ...` or `WARNING ... F1_TOKEN expires at ..., before the next recording window ends (...)`: refresh it.
- `INFO ... F1_TOKEN valid until ...`: fine.
- `F1_TOKEN expiry is unknown`: the value is not a decodable JWT or JSON response. Recording still tries to use it.

The last result is also written to `/data/token-status.json` on the `scheduler-data` volume (`state`: `valid` / `expiring` / `expired` / `unknown` / `missing`, `expires_at`, `window_end`, `message`):

```bash
docker compose exec scheduler cat /data/token-status.json
```

To refresh the token:

```bash
$EDITOR infra/.env               # replace F1_TOKEN=...
docker compose up -d scheduler   # recreates only the scheduler with the new value
docker compose logs scheduler | rg F1_TOKEN
```

## 2. Configure

```bash
cd infra
cp .env.example .env   # then set F1_TOKEN=...
```

`infra/.env` is git-ignored. Never commit a token.

## 3. Run

```bash
docker compose up -d --build
docker compose logs -f scheduler
```

## 4. Verify

```bash
curl -s http://127.0.0.1:8000/                               # "Welcome to OpenF1!"
curl -s "http://127.0.0.1:8000/v1/sessions?year=$(date +%Y)"  # local schedule (filled by the scheduler)
curl -s "http://127.0.0.1:8000/v1/laps?session_key=latest"     # during/after a recorded session
```

The scheduler log shows the next planned start, for example `Idle. Next: Race (key=...), ingestor starts at ...`.

## How the scheduler decides

- It polls `https://api.openf1.org/v1/sessions?year=<current>` every 30 min. The last good schedule is cached in the `scheduler-data` volume.
- Recording window: `[start - lead, end + buffer)`.
  - Race/Sprint: lead 60 min, buffer 60 min.
  - Everything else: lead 15 min, buffer 30 min.
  - Override with `LEAD_MINUTES_*` and `END_BUFFER_MINUTES_*`.
- Only one ingestor runs at a time. The livetiming feed is a single stream, and OpenF1 reads the session key from its `SessionInfo` topic.
- If the ingestor crashes during an open window, it is restarted on the next poll.
- Once a day it also runs OpenF1's `f1_scraping.schedule ingest-meetings/ingest-sessions`. This fills the local `/v1/meetings` and `/v1/sessions` endpoints, which the ingestor does not write.

## Historical backfill (static archive)

F1 publishes every topic of a finished session on its free static archive (`livetiming.formula1.com/static/<year>/...`), without any token. OpenF1's own historical ingestor (`openf1.services.ingestor_livetiming.historical`) downloads it and runs it through the same processing as the live ingestor. Once a session is ingested locally, the web app serves it from self-hosted, so it no longer depends on public OpenF1 (which rejects every free request while any session is live).

**Automatic, after each session.** On every tick the scheduler also decides (pure logic in `f1_scheduler/backfill.py`) whether to run one historical job (`python -m f1_scheduler.historical_job <year> <meeting> <session>`, a subprocess):

- A session is due `BACKFILL_PUBLISH_DELAY_MINUTES` (60) after its published end.
- Archive not published yet (no `Path` for the session in `static/<year>/Index.json`): exit code 3, retried every `BACKFILL_RETRY_MINUTES` (30).
- Only sessions that ended less than `BACKFILL_GIVE_UP_MINUTES` (2880 = 48 h) ago. Later they are marked `abandoned`. A fresh install therefore never ingests a whole season by itself.
- One job at a time, never while the live ingestor runs, and never when a recording window opens within 45 min.
- `BACKFILL_ENABLED=false` turns it off.

State lives in `/data/backfill-state.json` on the `scheduler-data` volume (`done` / `pending` / `abandoned`, attempts, last outcome):

```bash
docker compose exec scheduler cat /data/backfill-state.json
docker compose logs scheduler | rg historical
```

Each job is idempotent:

- After ingesting, it deletes older copies of that session, such as a partial live recording. It only does this in collections the archive produced documents for. OpenF1 ids are insertion timestamps, so "older" means `_id < job start`.
- It also creates `(session_key, date)` / `session_key` indexes. OpenF1 creates none, and without them every query scans whole collections and soon hits the query API's 5 s limit.

**One-off, for a season.** The command runs sessions one after the other and shares the same state file. It skips sessions already `done`. An interrupted run resumes.

```bash
docker compose exec scheduler python -m f1_scheduler backfill --year 2026 --dry-run   # plan + estimate
docker compose exec scheduler python -m f1_scheduler backfill --year 2026             # everything finished so far
docker compose exec scheduler python -m f1_scheduler backfill --year 2026 --session 11727 [--force]
```

**Measured cost** (2026 Bahrain FP1, a 1 h practice): 798,322 documents (location 402,380, car_data 394,460, laps 506, ...). That took 32 s of ingestion, about 1 min per job including download, and 42 MB of MongoDB disk (25.7 MB compressed data + 16.5 MB indexes). A race is about 2 h, so roughly twice that.

A full season is about 24 weekends × ~6 session-hours. Expect **~5-7 GB of disk and ~2-2.5 h** of wall time. The `--dry-run` estimate uses 45 MB / 1 min per session and 90 MB / 2 min per race-like session. Only one session has been ingested on this machine (the proof above), so the season figure is an extrapolation. On 2026-10-02 the dry-run listed 82 finished 2026 sessions, "~4.5 GB, ~102 min". That undercounts pre-season testing days, which are ~8 h sessions.

Check that a session is served locally:

```bash
curl -s "http://127.0.0.1:8000/v1/drivers?session_key=11727" | head -c 200
```

## Live recording without an F1TV token

Without `F1_TOKEN` the recorder never writes anything. OpenF1 kills it every 5 minutes ("file empty after 5 minutes") and restarts it. What the evidence shows (fastf1_livetiming at the pinned `FASTF1_LIVETIMING_SHA`, logs of 2026-10-02):

- OpenF1 only passes `--auth` when `F1_TOKEN` is set. Without it, `fastf1_livetiming save` uses the **legacy SignalR client** (`signalr/client.py`, `https://livetiming.formula1.com/signalr`). With it, it uses the SignalR Core client (`/signalrcore`).
- The legacy negotiate request now answers **HTTP 401 with an empty body** and `WWW-Authenticate: Basic` / `Bearer` (checked with curl on 2026-10-02, no session live). The client calls `request.json()` on it: `JSONDecodeError: Expecting value`.
- That error then hits a second bug. The client's `except websockets.exceptions.ConnectionClosed` fails with websockets 12 (`AttributeError: module 'websockets' has no attribute 'exceptions'`), the connection task dies ("Task exception was never retrieved"), and the output file stays empty.
- `POST https://livetiming.formula1.com/signalrcore/negotiate?negotiateVersion=1` without a token answers **200**.

Conclusion: the legacy, unauthenticated endpoint now refuses the connection itself. So the no-token path records **no topic at all**, not just the F1TV-only ones (`CarData.z`, `Position.z`).

What is not proven: whether F1 would stream any topics over SignalR Core without a token. Its negotiate works anonymously, but a subscription without a token was not tested: no session was live, and fastf1_livetiming's CLI does not expose its `no_auth` option.

In practice:

- Without a token, live sessions are not recorded locally. They become available about an hour after they end, through the historical backfill above.
- With a valid token, live recording works as described in section 1.

Run the unit tests:

```bash
cd infra/scheduler
python -m venv .venv && .venv/bin/pip install pytest
.venv/bin/python -m pytest -q
```

## Upgrading OpenF1

The upstream commits are pinned in `openf1/Dockerfile` (`OPENF1_SHA`, `FASTF1_LIVETIMING_SHA`). To upgrade, bump them and run `docker compose build`.
