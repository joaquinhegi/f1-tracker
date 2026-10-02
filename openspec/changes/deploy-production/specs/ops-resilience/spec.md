# Ops Resilience Specification

## Purpose

Keep the deployment recoverable at zero cost: nightly backups with bounded retention, a tested restore path, a reproducible VM bootstrap, bounded log growth, and automatic service recovery. Covers `infra/ops/` (bootstrap, backup, watchdog) and Compose hardening.

## Requirements

### Requirement: Nightly backups with 7-daily retention

The system MUST run a `mongodump` backup at least once per day and upload it to Object Storage. Exactly 7 daily backups MUST be retained; a successful backup beyond the 7th MUST cause the oldest retained backup to be deleted.

#### Scenario: Nightly backup succeeds
- GIVEN the nightly backup job runs
- WHEN it completes
- THEN a new dump exists in Object Storage dated today

#### Scenario: Retention enforced
- GIVEN 7 daily backups already exist in Object Storage
- WHEN the 8th nightly backup succeeds
- THEN the oldest of the 8 is deleted, leaving exactly 7

### Requirement: Tested restore

A documented restore procedure MUST exist that reconstructs a working MongoDB from an Object Storage backup. The restore procedure MUST be verified to succeed on a rebuilt VM.

#### Scenario: Restore after rebuild
- GIVEN a freshly bootstrapped VM and the latest backup in Object Storage
- WHEN the restore runbook is followed
- THEN MongoDB contains the data from that backup, and the stack serves it

### Requirement: Reproducible VM bootstrap

The VM MUST be reproducible from a committed bootstrap script or cloud-init configuration, without manual undocumented steps, so a reclaimed or destroyed instance can be rebuilt.

#### Scenario: Rebuild after reclaim
- GIVEN the VM was reclaimed by the provider
- WHEN the bootstrap script is run on a new instance
- THEN the stack reaches the same running configuration as before, pending a data restore

### Requirement: Bounded log growth

Every Compose service MUST use the `json-file` logging driver with an explicit `max-size` and `max-file`, so total log storage per service is bounded and cannot exhaust disk space.

#### Scenario: Long-running service
- GIVEN a service has been running for weeks
- WHEN its log files are inspected
- THEN their total size never exceeds `max-size * max-file`

### Requirement: Automatic service recovery

Every long-running Compose service MUST use a restart policy that recovers it automatically after a crash or host reboot, without manual intervention.

#### Scenario: Service crash
- GIVEN a service process exits unexpectedly
- WHEN Docker observes the exit
- THEN the service restarts automatically per its restart policy

### Requirement: Utilisation measurement

The operator MUST be able to measure the VM's recent CPU, memory and network utilisation, to assess idle-reclaim risk under the Always Free tier.

#### Scenario: Operator checks utilisation
- GIVEN the stack has been running for several days
- WHEN the operator requests utilisation figures
- THEN recent CPU, memory and network usage are available for inspection
