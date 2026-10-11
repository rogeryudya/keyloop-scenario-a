# M0 — Foundation

**Status:** `in-progress`
**Goal:** a production-shaped but empty service: runs, lints, tests, talks to Postgres, with the architecture skeleton in place. No AWS emulation yet (that's M4).
**Requirements:** NFR-2, NFR-3, NFR-4

## Tasks
- [x] `git init`, first commit with docs and `.claude/`
- [x] Scaffold NestJS app (pnpm), TypeScript `strict: true`, `.nvmrc`
- [x] ESLint + Prettier; scripts `lint`, `format`, `format:check`, `typecheck`
- [x] Boundary lint (eslint-plugin-boundaries or dependency-cruiser) enforcing the layer rules; a deliberate violation fails lint
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
- Node 24 LTS (changed from 22 at user request; `.nvmrc` = 24, `engines.node >=24`, Docker base `node:24-alpine`).
- TypeScript pinned to `^6`: TS 7.0 ships no programmatic compiler API, so `nest build` (and likely ts-jest) can't use it. Revisit when TS 7.1 restores the API.
- TS 6 gotchas: `types` defaults to `[]` (we set `"types": ["node"]`), `rootDir` must be explicit (set in `tsconfig.build.json`), `baseUrl` is deprecated (not used; use relative imports or `paths` without `baseUrl`).
- Lint: ESLint 10 flat config (`eslint.config.mjs`) + `typescript-eslint` `recommendedTypeChecked`; Prettier runs standalone (not via eslint-plugin-prettier), `eslint-config-prettier` turns off clashing rules. `reportUnusedDisableDirectives: error`.
- Prettier ignores `*.md` (hand-formatted docs with wide tables) and `prisma/seed/data.json` (one row per line on purpose).
- Boundary lint: `eslint.boundaries.mjs` (ADR-0005). It was checked against 32 fixture imports (allowed and denied, every layer pair and package rule), all correct. The fixture script was a one-off. **TODO in the test-infra task:** port it to a Jest test (`test/lint/boundaries.spec.ts`) using the `ESLint` API, so the acceptance criterion "a violation fails lint" stays tested.
- boundaries v7: `mode` is deprecated (folder is the default). Root files (`src/*.ts`) are a file *category* (`composition-root`), not an element. `element: { type: '*' }` doesn't match unclassified files.
