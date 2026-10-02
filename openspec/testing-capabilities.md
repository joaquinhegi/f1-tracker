## Testing Capabilities

**Strict TDD Mode**: enabled
**Detected**: 2026-10-02

This project is a dual-stack monorepo. Capabilities are reported per sub-project.

### web/ (Next.js 16, React 19, TypeScript strict)

#### Test Runner

- Command: `pnpm --dir web test` (CI mode: `vitest run`)
- Watch: `pnpm --dir web test:watch`
- Framework: Vitest 5 + jsdom environment, setup file `web/vitest.setup.ts`

#### Test Layers

| Layer       | Available | Tool                                  |
| ----------- | --------- | -------------------------------------- |
| Unit        | ✅        | Vitest                                  |
| Integration | ✅        | @testing-library/react + jsdom          |
| E2E         | ❌        | —                                       |

#### Coverage

- Available: ❌ (no `@vitest/coverage-v8`/`c8` devDependency or coverage script)
- Command: —

#### Quality Tools

| Tool         | Available | Command                      |
| ------------ | --------- | ----------------------------- |
| Linter       | ✅        | `pnpm --dir web lint` (ESLint 9, eslint-config-next) |
| Type checker | ✅        | `pnpm --dir web typecheck` (`next typegen && tsc --noEmit`, strict mode) |
| Formatter    | ❌        | — (no Prettier config detected) |

### infra/scheduler (Python 3.9+, pytest)

#### Test Runner

- Command: `<venv-python> -m pytest -q` run from `infra/scheduler`
- Framework: pytest >= 8 (`pyproject.toml` `[project.optional-dependencies].test`)
- No venv is committed to the repo; one must be provisioned per session/environment with `pytest>=8` installed.
- Verified working in this session: `83 passed` using the scratchpad venv at `/private/tmp/claude-501/-Users-joaquinhegi-Dev-f1-tracker/46923a03-ecaf-4b22-a38a-6ea4cfeb41bb/scratchpad/venv/bin/python` (session-scoped, will not persist to future sessions).

#### Test Layers

| Layer       | Available | Tool                        |
| ----------- | --------- | ---------------------------- |
| Unit        | ✅        | pytest (`tests/test_domain.py`, `test_service.py`, `test_backfill.py`, `test_token_health.py`) |
| Integration | ❌        | —                             |
| E2E         | ❌        | —                             |

#### Coverage

- Available: ❌ (no `pytest-cov` configured)
- Command: —

#### Quality Tools

| Tool         | Available | Command |
| ------------ | --------- | ------- |
| Linter       | ❌        | — (no ruff/flake8 config detected) |
| Type checker | ❌        | — (no mypy config detected) |
| Formatter    | ❌        | — (no black/ruff-format config detected) |

### infra/ (Docker Compose, OpenF1, mongo)

No test runner detected at this layer; `docker-compose.yml` defines `mongo`, `api` (OpenF1 query API), and `scheduler` services with healthchecks. Verification for this layer is primarily the scheduler's pytest suite plus container healthchecks, not a dedicated test framework.
