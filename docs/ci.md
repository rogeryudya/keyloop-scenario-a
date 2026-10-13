# CI pipeline (GitHub)

Scope: quality gates only. **No deploy** (interview project); it can be added later as a separate workflow.

## Overview

```
PR opened / updated, push to main
        │
        ├─ GitHub Actions: .github/workflows/ci.yml
        │    ├─ lint        format check · eslint (incl. layer boundaries) · typecheck · prisma validate · build
        │    ├─ terraform   fmt -check · validate (local + aws-dev) · tflint
        │    ├─ unit        domain + application tests, coverage report      (needs: lint)
        │    ├─ integration Testcontainers Postgres (+ floci secrets test)   (needs: lint)
        │    ├─ e2e         full app + Testcontainers                        (needs: lint)
        │    └─ smoke       docker compose --profile app up → GET /health    (needs: lint)
        │
        └─ Bugbot (GitHub App, PRs only): AI review comments, rules from .cursor/BUGBOT.md
```

`lint` and `terraform` run first because they're fast and fail cheaply. The test jobs run in parallel after `lint`.

## Jobs

| Job | Commands | Fails when |
|---|---|---|
| lint | `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm prisma validate`, `pnpm build` | formatting, lint, boundary violation, type error, invalid schema, build error |
| terraform | `terraform fmt -check -recursive`, `terraform validate` per env (`init -backend=false`), `tflint --recursive` (config `infra/.tflint.hcl`: terraform recommended preset + aws ruleset 0.49.0) | unformatted HCL, invalid config, lint findings |
| unit | `pnpm test:cov` | test failure, or domain+application coverage < 90% |
| integration | `pnpm test:int` | repository/contract/transaction/concurrency/secrets test fails |
| e2e | `pnpm test:e2e` | API contract test fails |
| smoke | `docker compose --profile app up -d --build --wait --wait-timeout 600`, `curl -f` on `/health` and `/docs`, logs on failure, then `down -v` | the reviewer quickstart is broken |

GitHub-hosted `ubuntu-latest` runners have Docker, so Testcontainers and Compose work with no extra setup and **no AWS credentials**.

## Run summary page
Every job adds a section to the run's **Summary** page on GitHub (Actions → the run), so results are readable without
opening logs. Each section still renders when an earlier step failed.

| Job | Section |
|---|---|
| lint | One row per check (Prettier, ESLint, typecheck, Prisma, build) with its outcome |
| terraform | `fmt`, `validate` (lists the envs), tflint |
| unit / integration / e2e | Suites, tests, passed/failed/skipped and duration; each failed test with its file and the first 25 lines of the error (ANSI stripped, collapsed); the 5 slowest suites |
| unit | Coverage gate table: each `coverageThreshold` folder from `jest.config.js`, aggregated like Jest does, ❌ below threshold |
| smoke | Startup time of the stack, `/health` and `/docs` results, container states and the `/health` body |

The test jobs also use Jest's `github-actions` reporter, which puts each failure as an annotation on the failing line
(PR → Files changed). The renderer is `scripts/ci/summary.ts` (pure functions in `summary-render.ts`, unit-tested in
`test/ci/`). Run it locally to preview: `mkdir -p reports && pnpm test --json --outputFile=reports/unit.json`, then
`pnpm tsx scripts/ci/summary.ts jest "Unit tests" reports/unit.json`. Terraform and smoke write their sections in bash,
because those jobs don't set up Node.

## Workflow skeleton
The real file is `.github/workflows/ci.yml` (actions pinned to commit SHAs, shared setup in `.github/actions/setup`). The outline:

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
- Pin actions to a full commit SHA (with the version in a comment) or at least a major version. Update via Dependabot (`.github/dependabot.yml`, weekly): `github-actions`, `npm`, `docker` (Dockerfile), `docker-compose` (pinned images) and `terraform` (providers in each env and module).
- Local checks without installing tools: `actionlint` via `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7`, and tflint via `ghcr.io/terraform-linters/tflint:v0.64.0`.
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
Active since 2026-10-13, when the repo was made public; GitHub only offers it on private repos with a paid plan.

- A PR is required to merge (even working solo, so CI runs on every change). It needs 0 approvals, since there is a
  single maintainer.
- Required checks: `lint`, `terraform`, `unit`, `integration`, `e2e`, `smoke`, and the branch must be up to date with
  `main`.
- No force pushes and no deleting `main`. Admins are exempt (`enforce_admins: false`), so the owner can still
  override in an emergency.
- Merge method isn't enforced. Stacked PRs are merged with merge commits so the next PR in the stack keeps only its
  own commits; PR titles follow conventional commits.

Read it back with `gh api repos/rogeryudya/keyloop-scenario-a/branches/main/protection`.
