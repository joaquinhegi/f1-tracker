# Proposal: deploy-production-ops

## Intent

Finish the zero-cost production deployment with its operational layer: the VM bootstrap, the host watchdog, backups and restore, the runbook and the config cleanup. This scope was split out of `deploy-production` on 2026-10-02 for two reasons:

- That change used 787 of its 800-line SDD runtime budget on phases 1–6.
- Its runtime objective can't be raised.

The user chose to keep **one pull request**. The commits for this change therefore land on the same branch, `feat/deploy-production`, under the user-accepted `size:exception`.

## Source of truth

Requirements, design and decisions are **not duplicated** here. They are inherited from the parent change `openspec/changes/deploy-production/`:

| Artifact | Where it lives | What applies |
|---|---|---|
| Specs | `specs/ops-resilience/spec.md` | Everything |
| | `specs/ops-alerting/spec.md` | The host watchdog events: web/api/mongo/scheduler health and backups |
| | `specs/production-runtime/spec.md` | Bootstrap and Funnel exposure |
| Design | `design.md` | Decisions 4 (Tailscale), 5 (host watchdog), 6 (backups), 7 (bootstrap) and 9 (config update) |
| Decisions | Engram `sdd/deploy-production/decisions`, `sdd/deploy-production/size-exception` | All of them |

## Scope

**In**:
- `infra/ops/{lib.sh,watchdog.sh,backup.sh,bootstrap.sh}`
- `infra/ops/cloud-init.yaml` and `infra/ops/systemd/*`
- shellcheck, so the CI job that is already wired passes
- `RUNBOOK.md`, a trimmed `infra/README.md`, and the `openspec/config.yaml` update
- a final gitleaks scan
- the operator checklist (phase 9 of the parent)

**Out**:
- Anything already delivered in parent phases 1–6.
- `infra/.env.example` (parent task 6.5). It stays with the parent and is blocked on a permission rule for `.env*` paths, so the user creates it or grants the path.

## Delivery

- Single PR, together with `deploy-production`, under `size:exception`.
- Estimated at 350–450 changed lines.
- It has its own SDD runtime objective.
