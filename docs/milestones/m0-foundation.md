# M0 — Foundation

**Status:** `in-progress`
**Goal:** a production-shaped but empty service: runs, lints, tests, talks to Postgres, with the architecture skeleton in place. No AWS emulation yet (that's M4).
**Requirements:** NFR-2, NFR-3, NFR-4

## Tasks
- [x] `git init`, first commit with docs and `.claude/`
- [x] Scaffold NestJS app (pnpm), TypeScript `strict: true`, `.nvmrc`
- [x] ESLint + Prettier; scripts `lint`, `format`, `format:check`, `typecheck`
- [x] Boundary lint (eslint-plugin-boundaries or dependency-cruiser) enforcing the layer rules; a deliberate violation fails lint
- [x] Config module: env validated at startup; `.env.example`. `DbCredentialsProvider` in `DATABASE_URL` mode only (Secrets Manager mode comes in M4)
- [x] Temporary dev DB: `postgres` service in `docker-compose.yml` (same major version as RDS); replaced by floci in M4
- [x] Prisma installed and connected; empty initial migration; scripts `db:migrate`, `db:seed`
- [x] Folder skeleton per `docs/architecture/folder-structure.md`: `shared/`, `modules/dealerships`, `modules/customers`, `modules/appointments`; `@nestjs/cqrs` installed
- [x] Shared building blocks: `DomainError` hierarchy, `Clock` port + `SystemClock`, cursor pagination types
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
- Config: no `@nestjs/config`. `src/config/load-env.ts` uses Node's built-in `process.loadEnvFile()` (skipped when `NODE_ENV=test`; shell vars win over `.env`). `validateEnv` uses class-validator and reports all problems at once without echoing values. `AppConfig` is the only typed reader. `DbCredentialsProvider` rejects `DB_SECRET_ID` until M4.
- `.env.example` sets `DATABASE_URL` for the temporary M0 dev DB. That's a deliberate exception to "DATABASE_URL in tests only" (CLAUDE.md rule 9) until M4 switches local runs to `DB_SECRET_ID`.
- **Nest 12 is ESM-only** (`"type": "module"`). Our build stays CommonJS and loads it through Node 24's native `require(esm)`. Jest needs `--experimental-vm-modules` for the same, which is in the `test` script. Keep this in mind for the `int`/`e2e` scripts.
- A minimal Jest `unit` project was pulled forward from the test-infra task so config could ship with tests (`jest.config.js`, `setupFiles: reflect-metadata`, `types: ["node","jest"]` in tsconfig, `["node"]` in the build tsconfig). The test-infra task adds the `int`/`e2e` projects and other scripts.
- Postgres major version: **17** (`postgres:17-alpine`). The docs didn't name one, so this is the pick. M4's RDS `engine_version` (floci) and the Testcontainers image must use the same major version.
- Dev DB: `docker compose up -d` starts only `postgres` on :5432 (`keyloop`/`keyloop`, volume `postgres-data`), matching `.env.example`. Reset with `docker compose down -v`. M4 removes it.
- Prisma **7.10**:
  - **Config:** `prisma.config.ts` (loads `.env` itself; M4 swaps this for `with-db-url`).
  - **Client:** `prisma-client` generator with `moduleFormat = "cjs"` writes TypeScript to `src/generated/prisma`. It's gitignored, and `postinstall` regenerates it. ESLint and Prettier skip it. Boundary lint lets only `infrastructure` and `shared/infrastructure` import it.
  - **Driver adapter:** `@prisma/adapter-pg` is required in Prisma 7. `PrismaService` takes the URL from `DbCredentialsProvider` and never reads env vars itself.
  - **Gotcha:** with driver adapters, `$connect()` is lazy, so a down DB didn't fail the boot. `PrismaModule` runs `SELECT 1` at startup (pool timeout 5 s); verified that the DB down gives exit 1 and the error output contains no URL or password.
- Scripts:
  - `db:migrate` = `prisma migrate deploy` (non-interactive, idempotent).
  - `db:migrate:dev` creates new migrations.
  - `db:seed` = `prisma db seed` → `node prisma/seed.ts`, a no-op until M1. **M1:** Node's type stripping can't import the generated client (extensionless TS imports), so the real seed probably needs a runner such as `tsx`, or a compiled script.
- **TODO in the test-infra task:** an int test for `PrismaModule` (connects against Testcontainers; boot fails on a bad URL). The health e2e will also cover the DB path.
- Skeleton: modules are plural (`dealerships`, `customers`, `appointments`), each with `<name>.module.ts` and four layer folders (`.gitkeep` until real files arrive; delete each `.gitkeep` when its folder gets content). `CqrsModule.forRoot()` is registered once in `AppModule`. `@nestjs/cqrs` 12 is ESM-only like the rest of Nest 12 (see the note above).
- Shared blocks:
  - **Errors:** `DomainError(code, message, details)` with four abstract categories. Modules must subclass them, never throw the bases.
  - **Clock:** `Clock` is an abstract class used as the DI token, bound globally to `SystemClock` by `ClockModule`.
  - **Pagination:** `shared/application/pagination` has `Cursor.encode/decode` (base64url JSON `{c, i}`, strict decode → `InvalidCursorError` `INVALID_CURSOR`), `buildPage` for `take: limit + 1`, and `PageRequest`/`Page<T>` with limits 20/100. The HTTP envelope (`data`/`meta`) is presentation's job (`PageResponseDto`, later).
