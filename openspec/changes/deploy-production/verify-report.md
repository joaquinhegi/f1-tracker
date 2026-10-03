```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:e9aec49ed8d45083f050d1e983a06644392c3d32c057945b27fc1e0a153007a3
verdict: fail
blockers: 1
critical_findings: 1
requirements: 5/20
scenarios: 8/28
test_command: (cd web && pnpm test) && (cd infra/scheduler && /private/tmp/claude-501/-Users-joaquinhegi-Dev-f1-tracker/46923a03-ecaf-4b22-a38a-6ea4cfeb41bb/scratchpad/venv/bin/python -m pytest -q)
test_exit_code: 0
test_output_hash: sha256:af477e573009eb9d00d742b47325cc0dc5196eab072250594811d51f189a92dc
build_command: cd web && pnpm build
build_exit_code: 0
build_output_hash: sha256:44f4ae6039d2e472e5350fed7245e1b555177f505ca4289e4b89b2ecb81ac3ed
```

## Re-verification (run 3)

**Changes**: `deploy-production` + `deploy-production-ops`, together with the follow-up `deploy-production-hardening` (one PR, branch `feat/deploy-production`, HEAD `97ac929`, tree `60d23dc`)
**Remediates**: `sha256:92fe2c76da6cb102a61da614348cd9d58eddc3cd8ed3d3bba92af65636998ce7` (run 2, FAIL with C5-R and C4)
**Remediation commits checked**: `bc43fa6`, `9308d66`, `2a23ec2`, `5240c58`, `f124365` (hardening change; full evidence in `openspec/changes/deploy-production-hardening/verify-report.md`, evidence `sha256:1e3a80eafa6c863febeba534b1f92ffd13eb3ecc1d450444b125f38e617ed3b0`, PASS WITH WARNINGS)
**Mode**: Strict TDD (scheduler + web units); Standard for shell/docs/config
**Delivery**: single PR under the user-accepted `size:exception`; `main...HEAD` is 36 files, 1532 insertions and 77 deletions (30 files, 1332 insertions and 24 deletions excluding `openspec/`)

### Result per run-2 CRITICAL

| ID | Result | Evidence |
|---|---|---|
| C5-R first boot aborts before the timers | RESOLVED | The real `bootstrap.sh` ran under `env -i` with a fake bin shadowing every system-changing command and with no `infra/.env`. Result: exit 0, rclone step skipped with a WARN, both unit sets installed, `systemctl enable --now f1-tracker-watchdog.timer f1-tracker-backup.timer`. A scratch copy with a fake `infra/.env` configured the remote exactly once and stayed idempotent on re-run. `RUNBOOK.md:19-20,27-29` documents the WARN and the re-run. |
| C4 unchecked tasks | OPERATOR-PENDING (unchanged, not a code failure) | `deploy-production` 6.5 `infra/.env.example` is still blocked by the user-owned `.env*` permission rule; `RUNBOOK.md:21` still tells the operator to copy it. `deploy-production-ops` 3.1-3.6 are `[OPERATOR]` VM tasks. Unchecked tasks remain CRITICAL under the verify rules, so archive stays blocked. |

### Deferred warnings closed by the hardening change

| ID | Result | Evidence |
|---|---|---|
| W1 ntfy failures swallowed | CLOSED | `ntfy.py:54-56` re-raises. The new tests fail against the pre-fix adapter (genuine RED). A verify probe with the real adapter through `SchedulerService` showed: failure → not persisted → re-sent and persisted on the next tick |
| W2 silent backup failure paths | CLOSED | `backup.sh:48-52,66-70`. Dry-run of both paths: state `unhealthy`, exit 1; watchdog alerts once, does not repeat, then recovers once |
| W4 workflow-wide `packages: write` | CLOSED | Only the `build` job has `packages: write` (`ci.yml:56-58`) |
| W5 no OCI source label | CLOSED | `ci.yml:93-94` |
| W7 auto-backfill on the first deploy | CLOSED (documented switch) | `BACKFILL_ENABLED=false` in `infra/.env` for the first deploy (`RUNBOOK.md:24-26,30-32`; `docker-compose.yml:71-74`); local dev default unchanged |
| W10 type-only assertions; `test_main.py` without assertions | CLOSED | Behavioural `urlopen` trap and real-post tests; explicit wiring assertion (`test_main.py:27-43`) |
| Source guard (new in run 2) | CLOSED | Sourcing each of the 3 scripts runs 0 commands; executing them runs `main` |

### Commands (run 3)

| Command | Exit | Result |
|---|---|---|
| `cd infra/scheduler && <venv>/bin/python -m pytest -q` | 0 | 106 passed |
| `cd web && pnpm test` | 0 | 57 files, 274/274 passed |
| `cd web && pnpm typecheck` | 0 | clean |
| `cd web && pnpm lint` | 0 | clean |
| `cd web && pnpm build` | 0 | `/api/health` dynamic route present |
| `shellcheck infra/ops/*.sh` | 0 | zero findings |
| `cd infra && docker compose config --quiet` | 0 | clean |
| `gitleaks git` | 0 | 24 commits scanned, no leaks |
| scheduler image rebuild + run (`--network none`, tmp `/data`, with and without `NTFY_TOPIC`) | 0 | runs; `RestartCount=0`; clean SIGTERM stop; topic never logged |
| web image rebuild + run against the local stack | - | healthy; `/api/health` 200 `{"status":"ok"}`; `/` 200 with real HTML |

Test containers and images were removed. The original `f1-tracker-{mongo,api,scheduler}-1` were left running and not touched.

### Spec Compliance changes vs run 2

| # | Scenario | Run 2 | Run 3 | Reason |
|---|---|---|---|---|
| 8 | Backup failure alert | PARTIAL | PARTIAL | Both silent paths now alert (dry-run); still no automated shell test (W9) |
| 9 | Repeated check, same failure | PARTIAL | PARTIAL | Dedup holds on both new failure paths (dry-run); no automated shell test. The scheduler has a partial-batch duplicate edge case (hardening W-H3) |
| 16 | Rebuild after reclaim | FAILING | NOT VERIFIABLE LOCALLY | C5-R fixed in the dry-run; a real VM is still needed (ops 3.6) |
| 28 | Fresh VM boot (first deploy starts empty) | NOT VERIFIABLE LOCALLY | NOT VERIFIABLE LOCALLY | The switch is now documented; still needs a VM |

Totals: 8 COMPLIANT, 9 PARTIAL, 11 NOT VERIFIABLE LOCALLY, 0 FAILING (28). Fully compliant requirements: 5/20 (unchanged). No scenario is FAILING any more. The remaining gaps are PARTIAL because shell behaviour is proven only by dry-runs (W9), or NOT VERIFIABLE LOCALLY because they need the VM, OCI or a CI run.

### Is the code side otherwise clean?

Yes. No CRITICAL code or docs finding remains. Every code-level CRITICAL from runs 1-2 (C1, C2, C3, C5, C5-R) is resolved and runtime-proven where it can be proven locally. The only open CRITICAL is C4, which is operator- and permission-bound.

### What exactly remains before archive

1. **`infra/.env.example` (deploy-production 6.5)**: the user creates it, because the `.env*` permission rule blocks agents. Suggested keys, with values quoted for bash and systemd parsing (hardening W-H1):
   - `F1_TOKEN`, `NTFY_TOPIC`, `TOKEN_CHECK_MINUTES`;
   - `IMAGE_PREFIX`, `IMAGE_TAG`;
   - `RCLONE_BUCKET`, `OCI_NAMESPACE`, `OCI_COMPARTMENT`, `OCI_REGION`;
   - `BACKFILL_ENABLED=false`, as a first-deploy note.

   Then check 6.5.
2. **`deploy-production-ops` 3.1-3.6 (operator, on the VM)**:
   - create the VM, the dynamic group, the policy and the bucket;
   - create the Tailscale key and enable Funnel;
   - fill `infra/.env`;
   - make the GHCR packages public;
   - run the forced alert test;
   - run the restore test.

   Alternatively, re-scope these tasks into an operator follow-up, which is a user decision.
3. **First CI run** on the PR: it should confirm scenario 26 (all three images published on `main`) and scenario 20.

After 1 and 2, or an explicit re-scope, run another verify. On unchanged code, that verify would only need to flip C4 and the VM-bound scenarios.

### Remaining findings (run 3)

**CRITICAL**
1. **C4**: unchecked operator/permission-bound tasks (above). Not a code failure.

**WARNING** (non-blocking)
- New in the hardening change, detailed in its report:
  - W-H1: `bootstrap.sh:17-28` parses `.env` as bash; an unquoted value with a space aborts the re-run.
  - W-H2: no repo test covers the "retried next tick" chain.
  - W-H3: `service.py:241-255` re-sends already-delivered alerts after a partial-batch failure.
  - W-H4: no shell test harness.
- Still open from earlier runs:
  - W3: retention is age-based, so 7-8 copies are kept (accepted).
  - W6: RUNBOOK sits at the repo root (known deviation).
  - W8: RED is not visible in history; verify reproduced it for Phase 3.
  - W9: some scenarios are proven only by dry-runs.

**SUGGESTION**: run-1 suggestions 2-6 (still deferred); hardening suggestions 1-3.

### Verdict (run 3)

**FAIL**, for C4 only. That finding is operator-pending, not a code defect.

- C5-R and the deferred W1, W2, W4, W5, W7 and W10 are resolved and proven at runtime.
- All suites, builds, linters, shellcheck, compose config, gitleaks and both image smoke tests are green.
- Archive needs C4 closed (or re-scoped) and then a fresh verify.

---

## History: run 2 (preserved)

Run-2 envelope (superseded; kept as text for history):

```text
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:92fe2c76da6cb102a61da614348cd9d58eddc3cd8ed3d3bba92af65636998ce7
verdict: fail
blockers: 2
critical_findings: 2
requirements: 5/20
scenarios: 8/28
test_command: (cd web && pnpm test) && (cd infra/scheduler && /private/tmp/claude-501/-Users-joaquinhegi-Dev-f1-tracker/46923a03-ecaf-4b22-a38a-6ea4cfeb41bb/scratchpad/venv/bin/python -m pytest -q)
test_exit_code: 0
test_output_hash: sha256:d6da2cfb937a955eebd008305c8db78798ee7def4794f250cd303a3af10838da
build_command: cd web && pnpm build
build_exit_code: 0
build_output_hash: sha256:47824035635341e8ff533f2e47265a0abf3cff168f3592bc4fbc2fef2e7ca226
```

### Re-verification (run 2)

**Changes**: `deploy-production` + `deploy-production-ops` (one PR, branch `feat/deploy-production`, HEAD `878376f`, tree `b969d7d`)
**Remediates**: `sha256:2faab26dcd32f9cedcac45d699f2fb973f05809157709d8ced4834b985990b30` (run 1, FAIL with C1-C5)
**Remediation commits checked**: `09e4103` (C1), `169068c` (C2), `10967c4` (C3), `878376f` (C5)
**Mode**: Strict TDD (scheduler + web units); Standard for shell/docs/config (no shell test runner)
**Delivery**: single-pr under the user-accepted `size:exception`

### Result per run-1 CRITICAL

| ID | Result | Evidence |
|---|---|---|
| C1 scheduler NameError | RESOLVED | Built the real scheduler image from `infra/` (`openf1/Dockerfile`, target `scheduler`, throwaway tag) and ran it with a tmp `/data` volume, `--network none`, no `NTFY_TOPIC`, no `F1_TOKEN`. Logged `Scheduler running (poll every 2s)`, completed ticks (idle, token warning, sync retry), `RestartCount=0`, no `NameError`. SIGTERM gave `Scheduler stopped`, exit 0. New `tests/test_main.py::test_main_builds_the_service_without_crashing` passes (104/104). Container and image removed afterwards. |
| C2 CI pnpm setup | RESOLVED (static) | `ci.yml:20-22` sets `package_json_file: web/package.json`. The upstream `pnpm/action-setup@v4` `action.yml` defines `package_json_file` as the path, relative to the repository root, of the `package.json` whose `packageManager` field is read. `web/package.json:35` has `"packageManager": "pnpm@11.9.0"`. CI has not run yet: there is no PR and no run for the branch. Runtime publishing is still not verifiable locally. |
| C3 duplicate backup alerts | RESOLVED | Dry-run with fake `docker`/`rclone`/`curl` on PATH (scratchpad only). Seeded success: 0 alerts. Night 1 (mongo container missing): `backup.sh` made 0 direct curl calls; the watchdog sent 1 `backup failed`. Night 2 (mongodump/rclone pipeline failure) plus 2 watchdog runs: 0 new. Night 3 success: 1 `Recovered: backup failed`. `backup.sh` no longer calls `ntfy_notify`. |
| C4 unchecked tasks | OPERATOR-PENDING (not a code failure) | `deploy-production` 6.5 `infra/.env.example` is blocked by the user-owned `.env*` permission rule. `deploy-production-ops` 3.1-3.6 are `[OPERATOR]` VM tasks. The skill rule keeps unchecked tasks CRITICAL, so this still blocks archive until the operator completes them or the tasks are re-scoped. `RUNBOOK.md:19` still references the missing `infra/.env.example`. |
| C5 rebuild reproducibility | NOT RESOLVED (regression) | Fixed: `configure_rclone_remote` is idempotent. With `OCI_*` exported and the remote absent there is exactly 1 `rclone config create oracleobjectstorage oracleobjectstorage provider instance_principal_auth namespace .. compartment .. region ..`; on re-run, 0. `RUNBOOK.md:19-21` documents the variables. Broken: see C5-R below. |

### New CRITICAL

**C5-R. The documented first boot now aborts before the timers are installed.**

- `infra/ops/cloud-init.yaml:14` runs `bootstrap.sh` with only `TAILSCALE_AUTHKEY` in the environment.
- `RUNBOOK.md` creates `infra/.env` at step 5, after bootstrap (step 3).
- `bootstrap.sh` never reads `infra/.env`.
- So `configure_rclone_remote` (`bootstrap.sh:56`) hits `${OCI_NAMESPACE:?...}`, and under `set -e` the script exits 1 before `install_unattended_upgrades` and `install_systemd_units`.

Dry-run evidence: the real `bootstrap.sh` was run with every mutating command faked on PATH and `env -i`.
- Cloud-init environment: exit 1, `OCI_NAMESPACE: OCI_NAMESPACE must be set`, 0 systemd units installed, 0 timers enabled.
- Effect: RUNBOOK step 4 ("both timers are active") fails on a fresh VM. Nothing documents re-running bootstrap with `OCI_*` exported.
- Requirement violated: ops-resilience "Reproducible VM bootstrap ... without manual undocumented steps". Before 878376f the timers were installed and only backups failed, so this is a regression.
- Possible fixes, for the orchestrator or user to choose:
  - make `configure_rclone_remote` skip with a warning when `OCI_*` is unset;
  - have bootstrap source `infra/.env` when present, and document a re-run after step 5;
  - or pass the `OCI_*` values through cloud-init.

### Commands (run 2)

| Command | Exit | Result |
|---|---|---|
| `cd infra/scheduler && <venv>/bin/python -m pytest -q` | 0 | 104 passed |
| `cd web && pnpm test` | 0 | 57 files, 274/274 passed |
| `cd web && pnpm typecheck` | 0 | clean |
| `cd web && pnpm lint` | 0 | clean |
| `cd web && pnpm build` | 0 | `/api/health` dynamic route present |
| `shellcheck infra/ops/*.sh` | 0 | zero findings |
| `cd infra && docker compose config --quiet` | 0 | clean |
| `gitleaks git` | 0 | 18 commits scanned, no leaks |
| `git ls-files --error-unmatch infra/.env` | 1 | not tracked; `git check-ignore`: `.gitignore:2:.env` |
| scheduler image build + run (no NTFY_TOPIC) | 0 | runs, no NameError, clean SIGTERM stop |
| C3 dry-run | - | 1 alert, then 0 new, then 1 recovery |
| C5 dry-run | - | idempotent with `OCI_*`; aborts (exit 1) in the cloud-init environment |

Original `f1-tracker-{mongo,api,scheduler}-1` containers kept running and were not touched. The test container `f1verify-sched` and image `f1verify-scheduler:rv` were removed.

### Spec Compliance changes vs run 1

| # | Scenario | Run 1 | Run 2 | Reason |
|---|---|---|---|---|
| 3 | Ingestor crash triggers notifier | COMPLIANT (prod start blocked) | COMPLIANT | entrypoint now starts |
| 9 | Repeated check, same failure | PARTIAL | PARTIAL | backup dedup proven by dry-run; still no automated shell test (W9) |
| 12 | No-op when unconfigured | PARTIAL | PARTIAL | scheduler side now runs without a topic; shell side has no automated test |
| 16 | Rebuild after reclaim | NOT VERIFIABLE LOCALLY | FAILING | C5-R dry-run |
| 26 | Pipeline publishes all three images | FAILING | NOT VERIFIABLE LOCALLY | C2 fixed statically; CI never ran |

Totals: 8 COMPLIANT, 9 PARTIAL, 10 NOT VERIFIABLE LOCALLY, 1 FAILING (28). Fully compliant requirements: 5/20 (unchanged).

### TDD Compliance (remediation batch)

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | C1 row in `sdd/deploy-production-ops/apply-progress` |
| All tasks have tests | Partial | C1 has `test_main.py`; C2/C3/C5 are yaml/shell with no runner (dry-run or static only) |
| RED confirmed (tests exist) | Yes | `infra/scheduler/tests/test_main.py` exists; the reported RED matches the run-1 NameError |
| GREEN confirmed (tests pass) | Yes | 104/104 |
| Triangulation adequate | N/A | single structural fix |
| Safety Net for modified files | Yes | 103/103 baseline |

Assertion quality for `test_main.py`: no explicit assertion. The test proves "no exception during construction", which is the C1 contract. It does not assert the wiring (for example, that `alert_state` is a `JsonFileAlertState`). WARNING, deferred with W8.

Coverage: skipped (no coverage tool installed). Linter and type checker: clean.

### Remaining findings (run 2)

**CRITICAL**
1. **C5-R**: the first boot through cloud-init aborts before the timers are installed (above). This is a code or docs fix and belongs to sdd-apply.
2. **C4**: operator-pending tasks (6.5 blocked by the permission rule; ops 3.1-3.6 VM). This is not a code failure.

**WARNING**: deferred, user-accepted, to a follow-up hardening change. They are not blockers.
- W1: ntfy failures are swallowed.
- W2: silent backup failure paths (`backup.sh:47` `cid=$(mongo_container)` and `backup.sh:61` `rclone size` pipeline).
- W3: retention is age-based.
- W4: workflow-wide `packages: write`.
- W5: no OCI source label.
- W7: `BACKFILL_ENABLED` defaults to true.
- W8: TDD gaps, including the assertion-free `test_main.py`.
- W9: scenarios proven only by probes or dry-runs.
- W10: type-only assertions.
- New: `bootstrap.sh` has no `BASH_SOURCE` source-guard around `main "$@"`, so sourcing it to test a function runs the full bootstrap.
- W6 (RUNBOOK at the repo root) remains a known design deviation.

**SUGGESTION**: run-1 suggestions 1-6, all deferred. Suggestion 1 (composition-root smoke test) is now done.

### Verdict (run 2)

**FAIL**

- C1, C2 and C3 are resolved.
- C5 is half-fixed and introduced a regression (C5-R): the documented cloud-init first boot aborts before the systemd timers are installed.
- C4 stays operator-pending.

All suites, builds, linters, shellcheck, compose config and gitleaks are green.

---

## History: run 1 (original findings, preserved)

Original run-1 envelope (superseded; kept as text for history):

```text
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:2faab26dcd32f9cedcac45d699f2fb973f05809157709d8ced4834b985990b30
verdict: fail
blockers: 5
critical_findings: 5
requirements: 5/20
scenarios: 8/28
test_command: (cd web && pnpm test) && (cd infra/scheduler && /private/tmp/claude-501/-Users-joaquinhegi-Dev-f1-tracker/46923a03-ecaf-4b22-a38a-6ea4cfeb41bb/scratchpad/venv/bin/python -m pytest -q)
test_exit_code: 0
test_output_hash: sha256:99541fed3ae42f91159f3fc4d6551f24276ef7bab3672dbbed556e31ba3f7c53
build_command: cd web && pnpm build
build_exit_code: 0
build_output_hash: sha256:ffaec8a5309233b4f370f6b474f54fd6e97276ef91ef15f033673e457759bc1b
```

## Verification Report

**Changes**: `deploy-production` + `deploy-production-ops` (one PR, branch `feat/deploy-production`, compared `main...feat/deploy-production`, HEAD `c50f634`, tree `347e1af`)
**Version**: N/A
**Mode**: Strict TDD (scheduler + web units); Standard for shell/docs/config (no shell test runner)
**Delivery**: single-pr under the user-accepted `size:exception` (Engram `sdd/deploy-production/size-exception`); diff is 1304 insertions + 76 deletions = 1380 changed lines.

Specs (all owned by `deploy-production`, inherited by `deploy-production-ops`): production-runtime (6 req / 9 scen), ops-resilience (6 / 7), ops-alerting (5 / 6), live-ingestion delta (3 / 6). Total 20 requirements, 28 scenarios.

### Completeness

| Change | Tasks total | Complete | Incomplete |
|--------|-------------|----------|------------|
| deploy-production | 28 | 27 | 1 (6.5 `infra/.env.example`, blocked by the `.env*` permission rule) |
| deploy-production-ops | 16 | 10 | 6 (3.1-3.6, operator-only, not apply-executable) |

Checked tasks match the code state: every checked file exists on the branch and does what the task says, apart from the defects below.

### Build & Tests Execution

| Command | Exit | Result |
|---|---|---|
| `cd web && pnpm test` | 0 | 57 files, 274/274 passed |
| `cd infra/scheduler && <venv>/bin/python -m pytest -q` | 0 | 103/103 passed |
| `cd web && pnpm typecheck` | 0 | clean |
| `cd web && pnpm lint` | 0 | clean |
| `cd web && pnpm build` | 0 | `/api/health` built as a dynamic route |
| `cd infra && docker compose config --quiet` | 0 | clean |
| `docker build web/` (arm64, local) | 0 | image built |
| web image run on `f1-tracker_default` network | - | Docker health `healthy`; `GET /api/health` 200 `{"status":"ok"}`; `GET /` 200 with real HTML (`<title>F1 Live Tracker</title>`); `USER node`; no `.env*` file in the image; `docker history` has no token/ntfy/secret strings |
| web image run with unreachable api (`http://api-unreachable:8000`) | - | `GET /api/health` 200, `GET /` 200 (graceful fallback) |
| `shellcheck infra/ops/*.sh` | 0 | zero findings |
| `gitleaks git` | 0 | 14 commits scanned, no leaks |
| `infra/.env` tracked? | - | not tracked; ignored by `.gitignore:2` |
| `python -m f1_scheduler` (composition root) | 1 | **`NameError: name 'JsonFileAlertState' is not defined`** at `__main__.py:108` |

The test containers and image were removed afterwards. The original `f1-tracker-{mongo,api,scheduler}-1` containers kept running and were not touched.

Extra evidence was gathered in the scratchpad only. Nothing was written to the repo:
- 5 pytest probes, all passed: token expiring between weekends alerts once; an unchanged periodic re-check refreshes the status file without notifying; a NullNotifier with an abandoned backfill completes the tick; an abandoned backfill alerts; a crash also restarts the ingestor; NtfyNotifier swallows HTTPError.
- Shell dry-runs with fake `docker`/`rclone`/`curl` on PATH: watchdog fire / dedup / recovery works; the backup alert duplicates; two silent backup-failure paths exist.

**Coverage**: not available (no `pytest-cov`, `coverage` or `@vitest/coverage-*` installed). Skipped.

### Spec Compliance Matrix

| # | Requirement | Scenario | Evidence | Result |
|---|---|---|---|---|
| 1 | LI: Services and MongoDB 7 | Upgrade attempt | `docker-compose.yml:15` pins `mongo:7`; needs a 6.19+ kernel | NOT VERIFIABLE LOCALLY |
| 2 | LI: Services and MongoDB 7 | Deploy pulls published images | `image:` refs resolve in `compose config`; GHCR publish blocked by C2, scheduler start blocked by C1 | NOT VERIFIABLE LOCALLY |
| 3 | LI: Scheduler notifier invocation | Ingestor crash triggers notifier | `test_service.py::test_ingestor_crash_notifies_once_and_persists_alert_state` (restart confirmed by probe) | COMPLIANT (service layer; prod start blocked by C1) |
| 4 | LI: Scheduler notifier invocation | Notifier unconfigured | `test_ntfy.py::test_build_notifier_with_unset_topic_is_a_no_op_null_notifier`; service-level only via verify probe | PARTIAL |
| 5 | LI: Periodic token health check | Token expires between race weekends | `test_periodic_token_check_reassesses_after_the_configured_interval` only checks save counts; expiring + notify-once only via verify probe | PARTIAL |
| 6 | LI: Periodic token health check | State unchanged | `test_periodic_token_recheck_does_not_duplicate_the_expiry_alert` covers a re-tick inside the interval, not a second periodic run; full scenario only via probe | PARTIAL |
| 7 | OA: Alert events | Ingestor crash alert | `test_service.py::test_ingestor_crash_notifies_once_and_persists_alert_state` | COMPLIANT |
| 8 | OA: Alert events | Backup failure alert | no automated test; dry-run: the rcat failure alerts, the `docker compose ps` failure exits 1 silently (W2) | PARTIAL |
| 9 | OA: Notify once per state change | Repeated check, same failure | no automated test; watchdog dry-run suppresses the repeat for api; backup path violates it (C3) | PARTIAL |
| 10 | OA: Recovery notice | Health recovers | no automated shell test; watchdog dry-run sends "Recovered:"; scheduler recovery in `test_alerts.py::test_evaluate_sends_a_recovery_alert_when_healthy_again` | PARTIAL |
| 11 | OA: Topic secrecy | Topic absent from repo | `gitleaks git` clean; `git grep` finds only `${NTFY_TOPIC}` and a fake test topic; `test_ntfy.py::test_notify_failure_is_logged_without_leaking_the_topic` | COMPLIANT |
| 12 | OA: No-op when unconfigured | Unset topic | `test_build_notifier_with_unset_topic...`; `lib.sh:21-23`; the scheduler entrypoint crashes regardless (C1) | PARTIAL |
| 13 | OR: Nightly backups | Nightly backup succeeds | needs OCI; dry-run happy path ok; rclone remote never configured (C5) | NOT VERIFIABLE LOCALLY |
| 14 | OR: Nightly backups | Retention enforced (exactly 7) | `backup.sh:72` prunes by age (`--min-age 7d`) with a 10 min random timer delay, so 7 or 8 are kept (W3) | PARTIAL |
| 15 | OR: Tested restore | Restore after rebuild | ops task 3.6 pending | NOT VERIFIABLE LOCALLY |
| 16 | OR: Reproducible VM bootstrap | Rebuild after reclaim | needs a VM; static gaps: rclone remote, `RCLONE_BUCKET`, `IMAGE_PREFIX` undocumented (C5) | NOT VERIFIABLE LOCALLY |
| 17 | OR: Bounded log growth | Long-running service | `compose config --format json`: all 4 services `json-file` 10m x 3 | COMPLIANT |
| 18 | OR: Automatic service recovery | Service crash | `compose config`: all 4 services `restart: unless-stopped` | COMPLIANT |
| 19 | OR: Utilisation measurement | Operator checks utilisation | `RUNBOOK.md:58-67` (docker stats, free, OCI console metrics) | NOT VERIFIABLE LOCALLY |
| 20 | PR: Web container image | CI build | local arm64 multi-stage standalone build passes, no secrets in layers; CI never ran and is blocked by C2 | PARTIAL |
| 21 | PR: Web service configuration | Upstream down, web still live | `route.test.ts` + runtime run with unreachable api: `/api/health` 200 | COMPLIANT |
| 22 | PR: Web service configuration | Default routing | runtime run on the compose network with `OPENF1_SELF_HOSTED_URL=http://api:8000`: `/` 200 with real data | COMPLIANT |
| 23 | PR: Public exposure boundary | Funnel serves only web | `bootstrap.sh:38` `funnel --bg 3000`; api/mongo bound to 127.0.0.1 | NOT VERIFIABLE LOCALLY |
| 24 | PR: Public exposure boundary | Direct access to api blocked | loopback binds (`compose config`); OCI security list is an operator step | NOT VERIFIABLE LOCALLY |
| 25 | PR: Public exposure boundary | SSH over tailnet only | `bootstrap.sh:33-35` `up --ssh` | NOT VERIFIABLE LOCALLY |
| 26 | PR: Image publishing | Pipeline publishes all three images | `ci.yml:20` makes the `web` job fail, so the gated `build` job never runs (C2) | FAILING |
| 27 | PR: No secrets in source or images | Secret scan passes | `gitleaks git` clean; `infra/.env` untracked/ignored; CI uses only `GITHUB_TOKEN` (`ci.yml:78`) | COMPLIANT |
| 28 | PR: First deploy starts empty | Fresh VM boot | needs a VM; `BACKFILL_ENABLED` defaults to true and auto-backfills sessions that ended within 48h (W7) | NOT VERIFIABLE LOCALLY |

**Compliance summary**: 8 COMPLIANT, 9 PARTIAL, 10 NOT VERIFIABLE LOCALLY, 1 FAILING (28 total). Fully compliant requirements: 5/20 (Topic secrecy, Bounded log growth, Automatic service recovery, Web service configuration, No secrets).

### Correctness (Static Evidence)

| Area | Status | Notes |
|---|---|---|
| Notifier port, ntfy adapter, NullNotifier | Implemented | Real adapter swallows send errors (W1) |
| Alerts domain (`evaluate`, classifiers) | Implemented | Pure, well tested |
| Alert state store | Implemented | Atomic write, tolerates a corrupt file |
| Service wiring (crash detection, periodic token check) | Implemented | Unit-tested through fakes |
| Composition root `__main__.py` | **Broken** | Missing import (C1) |
| `/api/health` route | Implemented | `force-dynamic`, no upstream call |
| web Dockerfile / `.dockerignore` / standalone | Implemented | Verified by a real build and run |
| Compose web service, logging, image refs | Implemented | |
| CI workflow | **Broken** | pnpm version is not resolvable (C2) |
| Host watchdog | Implemented | Dedup and recovery work in the dry-run |
| backup.sh / restore | Implemented with defects | C3, W2, W3 |
| bootstrap.sh / cloud-init / systemd | Implemented | rclone remote not configured (C5) |
| RUNBOOK.md, README, config.yaml | Implemented | RUNBOOK sits at the repo root (W6) and references the missing `.env.example` |

### Coherence (Design)

| Decision | Followed? | Notes |
|---|---|---|
| 1 Health route | Yes | |
| 2 Dockerfile | Yes | |
| 3 Compose image refs, logging, web service | Yes | |
| 4 Tailscale `--ssh` + `funnel --bg 3000` | Yes | |
| 5 Alerts, save only after a successful send | Partial | `NtfyNotifier.notify` never raises, so the "retry next tick" guarantee is lost (W1). Interface drift: `notify(title, message)` instead of `notify(alert)`; `Alert.recovered` missing; `ingestor_alert_state` unused |
| 5 Host watchdog | Partial | backup.sh notifies directly as well as through the watchdog, so alerts duplicate (C3) |
| 6 Backups via rclone instance principal | Partial | No rclone remote config anywhere (C5) |
| 7 cloud-init + idempotent bootstrap | Yes | |
| 8 CI | Partial | pnpm setup broken (C2); `org.opencontainers.image.source` label missing (W5); `packages: write` set workflow-wide (W4) |
| 9 Repo bootstrap, config.yaml | Yes | |
| 10 Periodic token check | Yes | |
| File placement: `infra/RUNBOOK.md` | No | Placed at the repo root (W6, known deviation) |

### TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | Table found in `sdd/deploy-production/apply-progress` (6 rows) |
| All tasks have tests | Partial | 6/6 TDD rows have test files. The `__main__.py` wiring (task 2.4/4.2) has no test, and that is where C1 lives |
| RED confirmed (tests exist) | Yes | 6/6 test files exist; 3 are new (`test_ntfy.py`, `test_alerts.py`, `test_json_cache.py`) |
| GREEN confirmed (tests pass) | Yes | 6/6 files pass now (103 + 274) |
| Triangulation adequate | Partial | Well triangulated except the periodic token scenarios (W9) |
| Safety Net for modified files | Yes | `test_service.py` 9/9 baseline; web 56/57 baseline |
| RED-before-GREEN visible in history | No | Tests and production code land in the same commits (`b0c5a7b`, `270525b`, `536b279`); RED rests on the apply self-report (W8) |

**TDD Compliance**: 4/7 checks fully passed.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit | 21 new (5 ntfy, 9 alerts, 2 json_cache, 4 service, 1 route) | 5 | pytest, vitest |
| Integration | 0 | 0 | Testing Library available (not needed here) |
| E2E | 0 | 0 | not installed |
| Shell | 0 automated | 0 | shellcheck only (static) |

### Changed File Coverage

Coverage analysis skipped: no coverage tool is installed.

### Assertion Quality

| File | Line | Assertion | Issue | Severity |
|---|---|---|---|---|
| `infra/scheduler/tests/test_ntfy.py` | 48-49 | `isinstance(notifier, NullNotifier)`; `notify(...)` with "no raise, no call" | Type-only; the "no network call" claim is not asserted | WARNING |
| `infra/scheduler/tests/test_ntfy.py` | 53 | `isinstance(build_notifier("   "), NullNotifier)` | Type-only | WARNING |
| `infra/scheduler/tests/test_ntfy.py` | 57 | `isinstance(notifier, NtfyNotifier)` | Type-only | WARNING |

**Assertion quality**: 0 CRITICAL, 3 WARNING.

### Quality Metrics

**Linter**: no errors (`pnpm lint`; `shellcheck` zero findings)
**Type Checker**: no errors (`pnpm typecheck`)

### CI workflow review (`.github/workflows/ci.yml`, never run)

| Check | Result |
|---|---|
| Triggers: PR + push to main | Yes (`ci.yml:3-6`); no tag trigger (design is main-only) |
| arm64 runner `ubuntu-24.04-arm` | Yes, on all 4 jobs |
| Test jobs gate the image matrix | Yes (`ci.yml:53` `needs: [web, scheduler, shellcheck]`) |
| GHCR push only on main, never on PRs or forks | Yes: login and push are gated on `github.event_name == 'push'` (`ci.yml:74,85`), and push only fires on `main` |
| Minimal permissions | No: `packages: write` is workflow-level (`ci.yml:8-10`) (W4) |
| Web job runnable | **No**: `pnpm/action-setup@v4` (`ci.yml:20`) has no `version`, and `package_json_file` defaults to the repo-root `package.json`, which does not exist (only `web/package.json`). The upstream v4 `readTarget` swallows ENOENT and then throws `No pnpm version is specified` (C2) |

### Issues Found

**CRITICAL**

1. **C1. The scheduler crashes at startup.** `infra/scheduler/f1_scheduler/__main__.py:108` uses `JsonFileAlertState`, but the import block at `__main__.py:17-21` only imports `JsonFileBackfillState`, `JsonFileScheduleCache` and `JsonFileTokenStatus`. Running the entrypoint gives `NameError: name 'JsonFileAlertState' is not defined`. With `restart: unless-stopped`, the production scheduler would crash-loop: no live recording, no backfill, no alerts.
   - Unit tests miss it because they never execute `main()`.
   - The locally running scheduler container predates this change (it has no `f1_scheduler.adapters.ntfy`), so the bug has not shown up.
2. **C2. CI can never publish images.** `.github/workflows/ci.yml:20` runs `pnpm/action-setup@v4` with no `version` and no `package_json_file: web/package.json`. The action reads the root `package.json`, which does not exist, so the `web` job fails. The gated `build` matrix never runs, and the "Image publishing" scenario fails.
3. **C3. Backup failures are not deduplicated.** `infra/ops/backup.sh:52,59` call `ntfy_notify` directly on every failure, and also write `unhealthy`, which `watchdog.sh:50` → `lib.sh:64-65` alerts on again. The dry-run shows one failure producing 2 notifications, and a second consecutive failed night producing a 3rd. This violates the ops-alerting "Notify once per state change" MUST.
4. **C4. Unchecked tasks.**
   - `deploy-production` 6.5 `infra/.env.example`: blocked by the `.env*` permission rule; known.
   - `deploy-production-ops` 3.1-3.6: operator-only; known.
   - Consequence: `RUNBOOK.md:19-20` tells the operator to copy a file that does not exist.
5. **C5. The VM rebuild is not reproducible from committed, documented steps.**
   - No committed script or runbook step creates the rclone remote that `backup.sh:16` assumes (`oracleobjectstorage` with instance-principal auth, namespace, compartment, region).
   - `RCLONE_BUCKET` (`backup.sh:30`) and `IMAGE_PREFIX`/`IMAGE_TAG` (needed for `compose pull` from GHCR) are documented nowhere a fresh operator would find them.
   - Result: nightly backups and `compose pull` both fail on a VM built from the runbook. This violates "Reproducible VM bootstrap... without manual undocumented steps".

**WARNING**

1. **W1.** `infra/scheduler/f1_scheduler/adapters/ntfy.py:52-53` swallow `URLError`/`OSError`, which includes `HTTPError` (confirmed by probe). The service's "persist only after a successful send" (`service.py` `_check_alerts`) never sees a real failure, so a transient ntfy outage permanently drops that alert. This deviates from design decision 5 ("raises on failure").
2. **W2.** Silent backup-failure paths under `set -e` (both confirmed by dry-run):
   - `backup.sh:47`: when `cid=$(mongo_container)` fails (e.g. `docker compose ps` errors), the script exits 1 with no state write and no alert, and the watchdog keeps reporting `healthy`.
   - `backup.sh:63`: when the `rclone size | grep` pipeline fails after a successful upload, the script exits 1 before pruning and before `state_set healthy`.
3. **W3.** Retention is age-based (`backup.sh:72` `--min-age 7d`). Combined with `RandomizedDelaySec=10min` (`systemd/f1-tracker-backup.timer:6`), 7 or 8 backups are kept, not "exactly 7" as the spec says.
4. **W4.** `ci.yml:8-10` grants `packages: write` to every job, including PR test jobs. Scope it to the `build` job.
5. **W5.** `ci.yml:79-88` sets no `org.opencontainers.image.source` label, although design decision 8 calls for it.
6. **W6.** `RUNBOOK.md` sits at the repo root, while the design lists `infra/RUNBOOK.md`. Known deviation.
7. **W7.** `docker-compose.yml:72` defaults `BACKFILL_ENABLED` to true, and `backfill.py:46,100` auto-backfill sessions that ended within 48h. A first deploy right after a race weekend would trigger a backfill, which conflicts with the "no backfill job is triggered automatically" scenario.
8. **W8.** Strict TDD gaps:
   - No test covers the composition root, which is where C1 lives.
   - RED-before-GREEN is not visible in git history because tests and code share commits.
9. **W9.** These scenarios have no covering repo test and were proven only by verify-phase probes or dry-runs:
   - LI "Notifier unconfigured", "Token expires between race weekends", "State unchanged";
   - all shell scenarios (no shell test harness).
10. **W10.** Type-only assertions in `test_ntfy.py:48,53,57`.

**SUGGESTION**

1. Add a composition-root smoke test that runs `main()` construction with stubbed env and adapters. It would have caught C1.
2. Have the watchdog alert on a stale backup (no successful run in more than 26h). Today a disabled timer leaves the state `healthy` forever.
3. `lib.sh:64` treats `down` and `unhealthy` as distinct bad states, so a transition between them re-alerts. Consider collapsing them into one.
4. Crash detection (`service.py:183`): an ingestor that dies a few seconds after each restart produces alternating crashed/recovered alerts every tick. Consider a recovery grace period.
5. CI hardening: add a `concurrency` group, pin actions by SHA, and note that apt `shellcheck` on runners may differ from the local version.
6. Align the design interface (`Notifier.notify(alert)`, `Alert.recovered`), or update design.md to match the implementation.

### Verdict

**FAIL**

There are five CRITICAL findings:
- the scheduler entrypoint crashes on start (C1);
- CI cannot install pnpm, so no image is ever published (C2);
- backup failures re-alert without deduplication (C3);
- tasks remain unchecked (C4);
- the rebuild depends on undocumented rclone and env setup (C5).

Suites, typecheck, lint, build, compose config, shellcheck and gitleaks are all green, and the web image works end to end against the local stack.
