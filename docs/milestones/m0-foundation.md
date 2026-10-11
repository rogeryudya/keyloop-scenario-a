# M0 — Foundation

**Status:** `todo`
**Goal:** a production-shaped but empty service: runs, lints, tests, talks to Postgres, with the architecture skeleton in place. No AWS emulation yet (that's M4).
**Requirements:** NFR-2, NFR-3, NFR-4

## Tasks
- [ ] `git init`, first commit with docs and `.claude/`
- [ ] Scaffold NestJS app (pnpm), TypeScript `strict: true`, `.nvmrc`
- [ ] ESLint + Prettier; scripts `lint`, `format`, `format:check`, `typecheck`
- [ ] Boundary lint (eslint-plugin-boundaries or dependency-cruiser) enforcing the layer rules; a deliberate violation fails lint
- [ ] Config module: env validated at startup; `.env.example`. `DbCredentialsProvider` in `DATABASE_URL` mode only (Secrets Manager mode comes in M4)
- [ ] Temporary dev DB: `postgres` service in `docker-compose.yml` (same major version as RDS); replaced by floci in M4
- [ ] Prisma installed and connected; empty initial migration; scripts `db:migrate`, `db:seed`
- [ ] Folder skeleton per `docs/architecture/folder-structure.md`: `shared/`, `modules/dealerships`, `modules/customers`, `modules/appointments`; `@nestjs/cqrs` installed
- [ ] Shared building blocks: `DomainError` hierarchy, `Clock` port + `SystemClock`, cursor pagination types
- [ ] Transactions: `@nestjs-cls/transactional` + Prisma adapter wired
- [ ] `configureApp()`: URI versioning (default `v1`), global `ValidationPipe`, `GlobalExceptionFilter` (standard error format), Swagger at `/docs`
- [ ] `GET /health` (app + DB check, version-neutral)
- [ ] Test infra: Jest projects unit / int / e2e; Testcontainers Postgres global setup; `resetDb()`; `FixedClock`; e2e app factory using `configureApp()`; scripts `test`, `test:int`, `test:e2e`, `test:cov`, `test:all`
- [ ] GitHub repo + basic `.github/workflows/ci.yml`: lint → unit / integration / e2e (terraform, smoke, Bugbot come in M4)
- [ ] Update `CLAUDE.md` commands to match the real scripts

## Acceptance criteria
- `docker compose up -d && pnpm db:migrate && pnpm start:dev` → `GET /health` returns 200
- `lint`, `typecheck`, `test`, `test:int`, `test:e2e` pass locally and in CI
- A layer-boundary violation fails `lint`
- An unknown route and an invalid body both return the standard error JSON

## Notes
- Keep M0 lean: the goal is to start M1–M2 (the scored business logic) quickly. Environment polish lives in M4.
