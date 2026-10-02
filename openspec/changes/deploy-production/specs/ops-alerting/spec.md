# Ops Alerting Specification

## Purpose

Notify the operator through ntfy when the deployment needs attention, without leaking the alert topic or re-notifying for an unchanged problem. Covers the scheduler's notifier port/adapter and the host watchdog.

## Requirements

### Requirement: Alert events

The system MUST send an ntfy notification when any of the following first becomes true: the F1TV token is `expiring`, the F1TV token is `expired`, the live ingestor fails to start or crashes, a backfill job fails, a backfill job is marked `abandoned`, a backup fails, the web service's health signal is down, or the api service's health signal is down.

#### Scenario: Ingestor crash alert
- GIVEN the live ingestor crashes during a recording window
- WHEN the scheduler detects the crash
- THEN an ntfy notification for ingestor failure is sent

#### Scenario: Backup failure alert
- GIVEN the nightly backup job exits with a non-zero status
- WHEN the failure is detected
- THEN an ntfy notification for backup failure is sent

### Requirement: Notify once per state change

An alert MUST be sent at most once per transition into a given failure/warning state. While the state remains unchanged, no repeat notification MUST be sent for the same condition.

#### Scenario: Repeated check, same failure
- GIVEN the api health signal is already reported down and alerted
- WHEN the next check also finds it down
- THEN no additional notification is sent for that same ongoing condition

### Requirement: Recovery notice

When a condition that previously triggered an alert returns to its healthy/normal state, a recovery notification MUST be sent.

#### Scenario: Health recovers
- GIVEN the web health signal was down and alerted
- WHEN it is next observed healthy
- THEN a recovery notification is sent

### Requirement: Topic secrecy

The ntfy topic MUST be read only from the `NTFY_TOPIC` environment variable, sourced from `infra/.env`. It MUST NOT be hardcoded, committed, or logged.

#### Scenario: Topic absent from repo
- GIVEN the repository's tracked files
- WHEN they are searched for the configured topic value
- THEN no match is found, because it exists only in the untracked `infra/.env`

### Requirement: No-op when unconfigured

When `NTFY_TOPIC` is unset, every notifier invocation MUST be a no-op: no network call is attempted, and the invocation MUST NOT raise an error that interrupts the caller.

#### Scenario: Unset topic
- GIVEN `NTFY_TOPIC` is not set
- WHEN the scheduler invokes the notifier for a failure event
- THEN no HTTP request is made, and the scheduler tick completes normally

## Known limitations

- A whole-VM outage (host, network or power down) goes unalerted: this deployment uses no external uptime pinger, by accepted decision.
