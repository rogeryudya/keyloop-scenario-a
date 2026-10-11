# CLAUDE.md

Guidance for AI assistants working in this repo. Keep this file short; details live in `docs/`.

## Project
Backend service for the Keyloop technical assignment. The brief and its clarified assumptions are the
source of truth: **read [docs/requirements.md](docs/requirements.md) before designing or coding any feature.**
Progress index: [docs/milestones/README.md](docs/milestones/README.md) — read it, then open only the current milestone file.

## Stack
Node 24 LTS · TypeScript (strict) · NestJS · Clean Architecture + CQRS (`@nestjs/cqrs`) · PostgreSQL + Prisma · Jest + Supertest · ESLint + Prettier ·
pnpm · Terraform (infra) · Local env: Docker Compose with floci (RDS + Secrets Manager), Grafana LGTM (OTel), WireMock · Tests: Testcontainers. Rationale: [docs/decisions/0001-tech-stack.md](docs/decisions/0001-tech-stack.md).

## Commands
> Fill in / correct once M0 scaffolding exists. Do not guess other commands — check `package.json`.

```bash
pnpm install              # install deps
docker compose up -d      # dev deps (M0–M3: postgres only; M4: floci, otel-lgtm, wiremock)
docker compose --profile app up --build   # full stack in Docker (reviewer mode)
pnpm infra:up             # Terraform (in Docker) → RDS + DB secrets in floci (idempotent)
pnpm db:migrate           # prisma migrate deploy (M4: resolves DB secret first)
pnpm db:migrate:dev       # create a new migration (prisma migrate dev --name <change>)
pnpm db:seed              # load prisma/seed/data.json (M1)
pnpm start:dev            # run API with watch
pnpm test                 # unit tests (no Docker)
pnpm test:int             # integration (Testcontainers, needs Docker)
pnpm test:e2e             # API e2e (Testcontainers + WireMock)
pnpm lint                 # eslint (incl. layer boundaries)
pnpm typecheck            # tsc --noEmit
pnpm format               # prettier --write (format:check in CI)
```

## Hard rules
1. **Don't invent requirements.** If the brief is ambiguous, pick the simplest reasonable option, record it under
   "Assumptions" in `docs/requirements.md`, and mention it in your reply. Unknowns go under "Open questions".
2. TypeScript strict. No `any`, no `@ts-ignore`, no non-null `!` without a comment explaining why.
3. Validate all external input at the boundary (DTOs with `class-validator`). Never trust request data past the controller.
4. Clean Architecture (see `docs/architecture/README.md`): controllers only map DTO → Command/Query → `CommandBus`/`QueryBus` → response DTO.
   Business rules live in `domain/`, use cases in `application/` handlers, Prisma only in `infrastructure/`.
   `domain/` imports no Nest, Prisma or validation libs. Never bypass the mediator from a controller.
5. Every feature or bug fix ships with tests (see `docs/testing/README.md`). Fakes for our ports, WireMock for external HTTP, never mock the DB. Business rules need unit tests covering edge cases.
6. Use the shared error format from `docs/conventions.md#errors`. Never leak stack traces or Prisma errors to clients.
7. No new dependency without a one-line justification in the PR/commit message; prefer what's already installed.
8. Keep changes scoped to the current milestone task. No drive-by refactors.
9. Never commit secrets. Config comes from env vars validated at startup (`.env.example` lists them); DB credentials come from Secrets Manager (`DB_SECRET_ID`), or `DATABASE_URL` in tests only.

## Workflow
Shortcut: `/next-task` runs the steps below.
1. Open `docs/milestones/README.md`, follow the "Current milestone" link, pick its first unchecked task.
2. For anything non-trivial, state a short plan (files to touch, approach, tests) before editing.
3. Implement → write/adjust tests → run lint, typecheck, tests.
4. Tick the task in the milestone file (and status in `docs/milestones/README.md` if it changed); update `docs/api.md` if endpoints changed.
5. Record non-obvious design choices as an ADR in `docs/decisions/` (copy the template).

## Definition of done
- `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; plus `pnpm test:int` when touching DB/adapters and `pnpm test:e2e` when touching the API
- New/changed endpoints documented in `docs/api.md` and visible in Swagger
- Milestone checkbox updated; assumptions/ADRs recorded where relevant

## Doc index — read when…
| Doing this | Read |
|---|---|
| Any feature work | [docs/requirements.md](docs/requirements.md), [docs/milestones/](docs/milestones/README.md) (current milestone only) |
| Any code: layer rules (always), then the layer file for the task | [docs/architecture/](docs/architecture/README.md) |
| Writing any code or tests | [docs/conventions.md](docs/conventions.md) |
| Adding/changing endpoints | [docs/api.md](docs/api.md) |
| Schema, migrations, Prisma models | [docs/data-dictionary.md](docs/data-dictionary.md) |
| Writing tests | [docs/testing/](docs/testing/README.md) |
| Running locally, AWS emulation, observability | [docs/local-dev/](docs/local-dev/README.md) |
| CI workflow, Bugbot rules, branch protection | [docs/ci.md](docs/ci.md) |
| Terraform, AWS resources, ECS/ECR | [docs/infrastructure.md](docs/infrastructure.md) |
| Making a design trade-off | [docs/decisions/](docs/decisions/) |
| Unsure how to approach a task with AI | [docs/ai-workflow.md](docs/ai-workflow.md) |
