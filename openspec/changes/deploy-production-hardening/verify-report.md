```yaml
schema: gentle-ai.verify-result/v1
evidence_revision: sha256:1e3a80eafa6c863febeba534b1f92ffd13eb3ecc1d450444b125f38e617ed3b0
verdict: pass_with_warnings
blockers: 0
critical_findings: 0
requirements: 0/0
scenarios: 0/0
test_command: (cd web && pnpm test) && (cd infra/scheduler && /private/tmp/claude-501/-Users-joaquinhegi-Dev-f1-tracker/46923a03-ecaf-4b22-a38a-6ea4cfeb41bb/scratchpad/venv/bin/python -m pytest -q)
test_exit_code: 0
test_output_hash: sha256:af477e573009eb9d00d742b47325cc0dc5196eab072250594811d51f189a92dc
build_command: cd web && pnpm build
build_exit_code: 0
build_output_hash: sha256:44f4ae6039d2e472e5350fed7245e1b555177f505ca4289e4b89b2ecb81ac3ed
```

## Verification Report

**Change**: `deploy-production-hardening`
**Branch / candidate**: `feat/deploy-production`, HEAD `97ac929`, tree `60d23dc`
**Hardening commits checked**: `bc43fa6`, `9308d66`, `2a23ec2`, `5240c58`, `f124365`, `97ac929` (diff `878376f..97ac929`: 214 insertions, 19 deletions, 11 files)
**Mode**: Strict TDD for Phase 3 (scheduler pytest); Standard for shell, yaml and docs (no shell test runner, so real-script dry-runs are used instead)
**Delivery**: single PR with the parent changes, under the user-accepted `size:exception`

### Artifact scope

- This change has a proposal and tasks only. Native `gentle-ai sdd-status` reports `specs: []` and `design: []`, so the authoritative counts in the envelope are 0 requirements and 0 scenarios.
- Requirements are inherited from `openspec/changes/deploy-production/` (20 requirements, 28 scenarios). Their compliance is re-evaluated in that change's report, section "Re-verification (run 3)".
- Design coherence is checked against the parent `design.md` for the touched decisions only (decisions 5, 6, 7 and 8).

### Completeness

| Metric | Value |
|---|---|
| Tasks total | 10 |
| Tasks complete | 10 |
| Tasks incomplete | 0 |

Every checked task matches the code on the branch.

### Task verification against real behaviour

| Task | Result | Evidence |
|---|---|---|
| 1.1 bootstrap sources `infra/.env`; with `OCI_*` unset, the rclone step is skipped with a WARN and the timers still install (C5-R) | VERIFIED | **Scenario A**: the real `infra/ops/bootstrap.sh` was run in the repo with no `infra/.env` (checked absent before the run). It ran under `env -i` with only `PATH=<fakebin>:/usr/bin:/bin`, `HOME` and `TAILSCALE_AUTHKEY`. The fake bin shadowed `docker`, `tailscale`, `rclone`, `curl`, `apt-get`, `dpkg`, `dpkg-reconfigure`, `install`, `systemctl`, `sudo`, `wget` and the file utilities. Result: exit 0, logs `no .../infra/.env yet, skipping` and `WARN configure_rclone_remote: ... skipping`, 0 `rclone config create`, both `install -m 0644` unit copies, `systemctl daemon-reload`, and `systemctl enable --now f1-tracker-watchdog.timer f1-tracker-backup.timer`. **Scenario B**: a byte-identical scratch copy (`cmp` clean) with a fake `infra/.env` containing `OCI_NAMESPACE`, `OCI_COMPARTMENT`, `OCI_REGION`, `RCLONE_BUCKET` and `BACKFILL_ENABLED=false`. Run 1: exit 0, `sourcing .../infra/.env`, exactly 1 `rclone config create oracleobjectstorage oracleobjectstorage provider instance_principal_auth namespace fakens compartment ocid1.compartment.oc1..fake region eu-madrid-1`. Run 2: exit 0, 0 new `config create` (idempotent); timers enabled on both runs. |
| 1.2 source guards in `bootstrap.sh`, `watchdog.sh`, `backup.sh` | VERIFIED | Each script was `source`d in `/bin/bash -c` under `env -i` with the fake bin. In all 3, `main` is defined and not invoked: 0 fake commands ran and no state dir was created. Control: executing `watchdog.sh` directly does run `main`. |
| 1.3 RUNBOOK re-run step and first-deploy note | VERIFIED | `RUNBOOK.md:19-20` says the WARN at step 4 is expected. `RUNBOOK.md:27-29` (step 6) says to re-run `bootstrap.sh` after `infra/.env` is filled. `RUNBOOK.md:24-26,30-32` covers the empty first deploy with `BACKFILL_ENABLED=false`. |
| 2.1 both silent backup failure paths record `unhealthy`, and the watchdog alerts once | VERIFIED | The real `backup.sh` and `watchdog.sh` were run under `env -i` with fake `docker`/`rclone`/`curl`, `NTFY_TOPIC` set, and a scratch `STATE_DIR`. Sequence and results: seed success (0 alerts); **P1** `docker compose ps` fails: exit 1, state `unhealthy`, 0 direct ntfy; watchdog: 1 `backup failed`; watchdog again: 0; success, then watchdog: 1 `Recovered: backup failed`. **P2** `rclone size` fails after upload: exit 1, state `unhealthy`; watchdog: 1 `backup failed`; watchdog again: 0; success, then watchdog: 1 recovery. `rclone delete` (prune) ran only on the 3 successful runs, never after a failure. |
| 3.1 RED: an ntfy failure leaves the alert state unpersisted and the alert is retried next tick | VERIFIED, with a coverage gap (W-H2) | The new tests `test_notify_raises_on_urlerror_without_leaking_the_topic` and `test_notify_raises_on_http_error_too` were re-run by verify against the pre-fix adapter (`f124365^:.../ntfy.py`, in a scratch copy). Both fail with `Failed: DID NOT RAISE`, so the RED is genuine. The "retried next tick" half has no repo test (see W-H2). |
| 3.2 GREEN: `NtfyNotifier` surfaces failures; the service keeps state-after-success | VERIFIED | `ntfy.py:54-56` logs, then re-raises. `service.py:241-255` catches each failure and persists only when all alerts were sent. A scratchpad probe with the real `NtfyNotifier` and a fake opener (`URLError`, then `HTTPError 503`) drove `SchedulerService` ticks: tick with failure → 0 saves; next tick → re-sent, 1 save, state `{"ingestor": "crashed"}`; following tick → no resend. 2/2 passed. The same probe fails against the pre-fix adapter (`assert (1 == 0)`). |
| 3.3 behavioural `test_ntfy.py` assertions and wiring assertion in `test_main.py` | VERIFIED | `test_ntfy.py:61-80` traps `urllib.request.urlopen` to prove the NullNotifier makes no network call. `test_ntfy.py:83-95` proves `build_notifier("my-topic")` posts to `https://ntfy.sh/my-topic`; the opener is resolved at construction time, after the monkeypatch, so the trap is effective. `test_main.py:27-43` asserts `service._notifier` is a `NullNotifier` and `service._alert_state_store` is a `JsonFileAlertState` with `NTFY_TOPIC` unset. |
| 4.1 first deploy runs no automatic backfill; local dev unchanged | VERIFIED (documented switch) | `docker-compose.yml:71-75` keeps the default `true` and documents the override. `RUNBOOK.md:24-26,30-32` sets `BACKFILL_ENABLED=false` for the first deploy. `docker compose config --quiet` exits 0 without `infra/.env`. |
| 4.2 `packages: write` only on the build job; OCI source label | VERIFIED (static) | Parsed YAML: workflow `permissions` = `{contents: read}`; `web`, `scheduler` and `shellcheck` have no job override; `build` = `{contents: read, packages: write}` (`ci.yml:56-58`). `ci.yml:93-94` adds `org.opencontainers.image.source=https://github.com/${{ github.repository }}`. CI has not run (no PR yet). |
| 5.1 gate | VERIFIED | See the commands table below. |

### Build & Tests Execution

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
| scheduler image rebuilt (`infra/openf1/Dockerfile`, target `scheduler`) and run with `--network none` and a tmp `/data` | 0 | Two runs, without and with a fake `NTFY_TOPIC`: `Scheduler running (poll every 2s)`, ticks completed, `RestartCount=0`, no `NameError`; SIGTERM gave `Scheduler stopped`, exit 0; the fake topic appears 0 times in the logs |
| web image rebuilt and run on `f1-tracker_default` with `OPENF1_SELF_HOSTED_URL=http://api:8000` | - | Docker health `healthy`, `USER node`; `GET /api/health` 200 `{"status":"ok"}`; `GET /` 200 with `<title>F1 Live Tracker</title>` |

Cleanup: test containers `f1verify-sched-{notopic,topic}` and `f1verify-web`, and images `f1verify-scheduler:rv3` and `f1verify-web:rv3`, were removed. The original `f1-tracker-{mongo,api,scheduler}-1` were left running and not touched. All dry-runs and probes ran in the scratchpad; nothing was written to the repo.

**Coverage**: no coverage tool is installed. Skipped.

### TDD Compliance (Phase 3)

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | Yes | Table in Engram `sdd/deploy-production-hardening/apply-progress` |
| All tasks have tests | Yes | 3.1-3.3 → `test_ntfy.py`, `test_main.py` |
| RED confirmed (tests exist) | Yes | Independently reproduced: both raise tests fail against the pre-fix adapter |
| GREEN confirmed (tests pass) | Yes | 106/106 |
| Triangulation adequate | Yes | `URLError`/`OSError` and `HTTPError` cases; null, blank and real topic cases |
| Safety Net for modified files | Yes | 104/104 baseline reported; consistent with the run-2 count |

**TDD Compliance**: 6/6. Tests and fix share commit `f124365`, so RED is not visible in git history. The verify-phase reproduction against `f124365^` substitutes for that evidence.

### Test Layer Distribution

| Layer | Tests | Files | Tools |
|---|---|---|---|
| Unit | 7 changed or new (5 in `test_ntfy.py`, 2 in `test_main.py`) | 2 | pytest |
| Integration | 0 | 0 | - |
| E2E | 0 | 0 | not installed |
| Shell | 0 automated | 0 | shellcheck (static) plus verify dry-runs |

### Assertion Quality

| File | Line | Assertion | Issue | Severity |
|---|---|---|---|---|
| `infra/scheduler/tests/test_main.py` | 42-43 | `isinstance(service._notifier, NullNotifier)`, `isinstance(service._alert_state_store, JsonFileAlertState)` | Wiring assertions on private attributes. This is acceptable for a composition-root test, but it is coupled to the attribute names | SUGGESTION |

**Assertion quality**: 0 CRITICAL, 0 WARNING. The run-2 W10 type-only assertions are replaced by behavioural ones.

### Quality Metrics

**Linter**: clean (`pnpm lint`; `shellcheck` zero findings)
**Type Checker**: clean (`pnpm typecheck`)

### Coherence (parent design, touched decisions)

| Decision | Followed? | Notes |
|---|---|---|
| 5 Alerts: the adapter raises on failure, and state is saved only after a successful send | Yes | W1 closed. See the batch edge case W-H3 |
| 5 Host watchdog is the single alert path for backups | Yes | No direct backup notify; both silent paths now write state |
| 6/7 Idempotent bootstrap and instance-principal rclone remote | Yes | Cloud-init first boot completes. The remote is configured on the documented re-run |
| 8 CI: least-privilege packages, source label | Yes | W4 and W5 closed |

### Issues Found

**CRITICAL**: None.

**WARNING**
1. **W-H1. `bootstrap.sh` parses `infra/.env` as bash (`infra/ops/bootstrap.sh:17-28`).** The same file is also read by docker compose (dotenv rules) and by systemd (`EnvironmentFile=` in `infra/ops/systemd/*.service`), which use different rules. In a probe, a compose-valid unquoted value with a space (`NOTE=first deploy`) made the re-run abort with exit 127 (`deploy: command not found`) before the rclone remote step. The failure is loud and the timers are already installed by step 3, so this is not silent. It is also undocumented. Fix by quoting the values in the RUNBOOK/`.env.example` guidance, or by parsing only the needed `OCI_*` keys.
2. **W-H2. No repo test covers "retried on the next tick" (task 3.1).** `infra/scheduler/tests/test_service.py:251-263` uses `FakeNotifier(fail=True)` and stops after the failing tick. The adapter raise is tested in isolation (`test_ntfy.py:38-58`). The full chain (real `NtfyNotifier` failure → no persist → resend and persist next tick) was proven only by the verify scratchpad probe.
3. **W-H3. A partial-batch failure re-sends alerts that were already delivered (`infra/scheduler/f1_scheduler/service.py:241-255`).** If 2 alerts fire in one tick and only the second send fails, nothing is persisted, so the next tick re-sends the first one as well. Probe: `['...(backfill:a)', '...(backfill:b)' ✗, '...(backfill:a)', '...(backfill:b)']`. This is an edge case of ops-alerting "Notify once per state change". It became reachable when the adapter started raising (before, failures were dropped instead). Fix: persist the delivered keys on each success.
4. **W-H4 (carried W9).** The shell changes (tasks 1.x and 2.1) have no automated test harness. Verify dry-runs are the only runtime proof.

**SUGGESTION**
1. `source_env_file` exports every `.env` value (`set -a`), including `F1_TOKEN` and `NTFY_TOPIC`, into the environment of every child process of bootstrap, including the `curl | sh` installers when a tool is missing. Export only the `OCI_*` keys.
2. The watchdog recovery notice reuses the failure message body ("The latest backup job did not complete successfully.") under the title `Recovered: backup failed` (`infra/ops/lib.sh:62`, `infra/ops/watchdog.sh:50-51`).
3. `test_main.py` asserts on private attributes. A small public accessor, or asserting through behaviour, would decouple it.

### Verdict

**PASS WITH WARNINGS**

- All 10 hardening tasks are complete and match real behaviour. C5-R is fixed: the cloud-init first boot installs the timers, and the documented re-run configures the remote.
- W1, W2, W4, W5, W7 and W10 are closed.
- All suites, builds, linters, shellcheck, compose config, gitleaks and both image smoke tests are green.
- Four non-blocking warnings remain (W-H1 to W-H4).
