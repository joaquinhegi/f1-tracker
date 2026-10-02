# Delta for Live Ingestion

## MODIFIED Requirements

### Requirement: Services and MongoDB 7

The stack MUST run four services:
- `mongo`: `mongo:7`, data in the `mongo-data` volume, bound to `127.0.0.1:27017`;
- `api`: the OpenF1 query API on `127.0.0.1:8000`;
- `scheduler`: not exposed, state in the `scheduler-data` volume at `/data`;
- `web`: the Next.js UI, bound to `127.0.0.1:3000`, with a health signal.

MongoDB MUST stay on major version 7, because Mongo 8 crashes on Linux kernel ≥ 6.19 (SERVER-121912). The API and scheduler MUST wait for a healthy `mongo`. OpenF1 commits MUST be pinned (`OPENF1_SHA`, `FASTF1_LIVETIMING_SHA`). No MQTT broker is used. The `api`, `scheduler` and `web` images MUST be published to GHCR by CI and referenced by tag in Compose, not built on the VM. Every service's logs MUST use the `json-file` driver with a bounded `max-size` and `max-file`.

(Previously: three services, no GHCR image references, no documented log limits.)

#### Scenario: Upgrade attempt
- GIVEN someone changes the image to `mongo:8`
- WHEN the host kernel is 6.19 or newer
- THEN mongo crashes, which is why the image is pinned to 7

#### Scenario: Deploy pulls published images
- GIVEN a new version tagged and pushed to GHCR by CI
- WHEN the operator runs `docker compose pull && up -d` on the VM
- THEN all four services restart from the newly published images, with no local build

## ADDED Requirements

### Requirement: Scheduler notifier invocation

The scheduler MUST invoke its configured notifier when the ingestor fails to start or crashes, when a backfill job fails or is marked `abandoned`, and when the F1TV token health transitions to `expiring` or `expired`. When no notification channel is configured, the notifier invocation MUST be a no-op that does not fail the scheduler tick.

#### Scenario: Ingestor crash triggers notifier
- GIVEN an ingestor that exits with an error during a race window
- WHEN the scheduler detects the crash on the next tick
- THEN it invokes the notifier with the ingestor-failure event, in addition to restarting the ingestor

#### Scenario: Notifier unconfigured
- GIVEN no notification channel is configured
- WHEN a backfill job is marked `abandoned`
- THEN the notifier invocation completes without error, and nothing is sent

### Requirement: Periodic token health check

Besides the existing checks (first tick, and right before each ingestor start), the scheduler MUST re-assess F1TV token health periodically, every `TOKEN_CHECK_MINUTES` (default 360), and refresh the token status file each time. This lets an expiring token raise an alert days before a session, not only when its recording window opens.

#### Scenario: Token expires between race weekends
- GIVEN a valid token that will expire in 2 days, and no recording window opening for 5 days
- WHEN the periodic check runs
- THEN token health becomes `expiring` and the notifier is invoked once for that state change

#### Scenario: State unchanged
- GIVEN token health was already `expiring` at the previous periodic check
- WHEN the next periodic check runs and the state is still `expiring`
- THEN the status file is refreshed and no new notification is sent
