# CI pipeline (GitHub)

Scope: quality gates only. **No deploy** (interview project); it can be added later as a separate workflow.

## Overview

```
PR opened / updated, push to main
        │
        ├─ GitHub Actions: .github/workflows/ci.yml
        │    ├─ lint        format check · eslint (incl. layer boundaries) · typecheck · prisma validate
        │    ├─ terraform   fmt -check · validate (local + aws-dev) · tflint
        │    ├─ unit        domain + application tests, coverage report      (needs: lint)
        │    ├─ integration Testcontainers Postgres (+ floci secrets test)   (needs: lint)
        │    ├─ e2e         full app + Testcontainers + WireMock             (needs: lint)
        │    └─ smoke       docker compose --profile app up → GET /health    (needs: lint)
        │
        └─ Bugbot (GitHub App, PRs only): AI review comments, rules from .cursor/BUGBOT.md
```

`lint` runs first because it's fast and fails cheaply. The test jobs run in parallel after it.

## Jobs

| Job | Commands | Fails when |
|---|---|---|
| lint | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm prisma validate` | formatting, lint, boundary violation, type error, invalid schema |
| terraform | `terraform fmt -check -recursive`, `terraform validate` per env (`init -backend=false`), `tflint` | unformatted HCL, invalid config, lint findings |
| unit | `pnpm test:cov` | test failure, or domain+application coverage < 90% |
| integration | `pnpm test:int` | repository/contract/transaction/concurrency/secrets test fails |
| e2e | `pnpm test:e2e` | API contract test fails |
| smoke | `docker compose --profile app up -d --build --wait`, `curl -f localhost:3000/health`, then `down -v` | the reviewer quickstart is broken |

GitHub-hosted `ubuntu-latest` runners have Docker, so Testcontainers and Compose work with no extra setup and **no AWS credentials**.

## Workflow skeleton

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      - uses: pnpm/action-setup@<pinned>
      - uses: actions/setup-node@<pinned>
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm prisma validate

  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      - uses: hashicorp/setup-terraform@<pinned>
      - run: terraform fmt -check -recursive infra
      - run: |
          for env in infra/envs/*/; do
            terraform -chdir="$env" init -backend=false -input=false
            terraform -chdir="$env" validate
          done
      - uses: terraform-linters/setup-tflint@<pinned>
      - run: tflint --chdir=infra --recursive

  unit:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - # checkout + pnpm + node + install (same as lint)
      - run: pnpm test:cov
      - uses: actions/upload-artifact@<pinned>
        if: always()
        with: { name: coverage, path: coverage/ }

  integration:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - # checkout + pnpm + node + install
      - run: pnpm prisma generate
      - run: pnpm test:int

  e2e:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - # checkout + pnpm + node + install
      - run: pnpm prisma generate
      - run: pnpm test:e2e

  smoke:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@<pinned>
      - run: docker compose --profile app up -d --build --wait
      - run: curl -fsS http://localhost:3000/health
      - if: failure()
        run: docker compose --profile app logs
      - if: always()
        run: docker compose --profile app down -v
```

The repeated setup steps go in a composite action (`.github/actions/setup/action.yml`) once the workflow exists.

## Rules
- Pin actions to a full commit SHA (with the version in a comment) or at least a major version. Update via Dependabot (`.github/dependabot.yml` for `github-actions` and `npm`, weekly).
- `permissions: contents: read` by default; grant more per job only if needed.
- CI uses exactly the same `pnpm` scripts as local dev. If it passes locally (`pnpm test:all`), it passes in CI.
- Node version comes from `.nvmrc`, used by both CI and developers.
- No secrets are required for CI. If one is ever added, it goes in GitHub Actions secrets, never in the workflow file.

## Bugbot (AI PR review)
- Install the Cursor Bugbot GitHub App on the repo (requires a Cursor account; check current plan/pricing). It reviews every PR automatically and can be re-triggered with a PR comment.
- Project rules go in `.cursor/BUGBOT.md`. Keep it short and **point to the existing docs** instead of duplicating them:
  ```markdown
  # Bugbot rules
  Review against the project rules in CLAUDE.md, docs/architecture/README.md and docs/conventions.md. Flag especially:
  - layer violations (domain importing Nest/Prisma, controllers not using CommandBus/QueryBus)
  - business rules in controllers or DTOs instead of domain
  - entities, views or Prisma types leaking across layers (docs/architecture/data-types.md)
  - missing tests for new business rules or failure branches
  - non-standard error responses, missing cursor pagination on list endpoints
  - secrets, `any`, `new Date()` in domain/application
  ```
- Bugbot is advisory: its comments are reviewed and resolved by a human, and it is **not** a required status check.
- Alternative without a Cursor account: `anthropics/claude-code-action` as a PR-review workflow, using the same rules file content.

## Branch protection (main)
- Require a PR to merge (even working solo, so Bugbot and CI run on every change).
- Required checks: `lint`, `terraform`, `unit`, `integration`, `e2e`, `smoke`.
- Require branches to be up to date; squash merge with a conventional-commit title.
