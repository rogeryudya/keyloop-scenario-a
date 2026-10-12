# Testing

## Strategy at a glance

| Level | What it proves | Location | Runs against | Command | Speed |
|---|---|---|---|---|---|
| Unit: domain | Business rules and invariants | `src/modules/*/domain/*.spec.ts` | Nothing (pure TS) | `pnpm test` | ms |
| Unit: application | Handler orchestration, error paths | next to handler `*.handler.spec.ts` | In-memory fakes + `FixedClock` | `pnpm test` | ms |
| Integration | Prisma repositories, mappers, DB constraints, transactions, concurrency, secret loading | `*.int-spec.ts` next to the adapter | Postgres via Testcontainers; floci for the secrets test | `pnpm test:int` | seconds |
| e2e (API) | HTTP contract: routes, versioning, validation, status codes, error format | `test/e2e/*.e2e-spec.ts` | Full app + Testcontainers Postgres + WireMock | `pnpm test:e2e` | seconds |
| Manual / exploratory | It works end-to-end in the AWS-like env; telemetry looks right | `.http` files in `test/http/` | Local env (floci, LGTM) | — | — |

Most tests are unit tests. Business rules are proven at the domain level, not through HTTP.

Details:
- [unit.md](unit.md): domain and handler tests, fakes, builders
- [integration-and-e2e.md](integration-and-e2e.md): Testcontainers, DB reset, concurrency, secrets, e2e app factory
- [test-doubles.md](test-doubles.md): fake vs stub vs mock, and when to use WireMock
- [../local-dev/observability.md](../local-dev/observability.md#observing-while-testing): observing while testing

## Environments: tests vs local run
| | Automated tests (local + CI) | Local dev run |
|---|---|---|
| DB | Testcontainers `postgres:<same major as RDS>` | floci RDS |
| DB credentials | `DATABASE_URL` injected by test setup | Secrets Manager (floci) |
| External HTTP | WireMock (Testcontainers or Compose) | WireMock (Compose) |
| Telemetry | Off (or in-memory exporter) | OTLP → Grafana LGTM |

Tests never depend on a developer's running Compose stack or on manual bootstrap. `pnpm test:int` / `pnpm test:e2e` start and stop what they need.

## Rules
1. Every business rule: happy path + each failure branch + boundary values.
2. A bug fix starts with a failing test that reproduces it.
3. Test behaviour, not implementation: assert on outputs, state and error `code`s, not on which private method was called.
4. No real clock or network in unit tests (`FixedClock`, fakes). Handlers may generate ids with `randomUUID()`; tests use the returned id, never a hard-coded one.
5. Tests are independent: any test can run alone, in any order. No shared mutable state between tests.
6. Test names read as behaviour: `it('rejects an appointment that overlaps an existing one')`.
7. No snapshot tests for API responses.
8. Arrange/Act/Assert layout, with one behaviour per test (multiple asserts about that behaviour are fine).

## Coverage
- Gate: every `domain/` and `application/` folder ≥ 90% statements, branches, functions and lines, aggregated per folder (`coverageThreshold` in `jest.config.js`). `pnpm test:cov` fails below it, and CI runs it. Overall is reported but not gated. Add a new module's `domain/`/`application/` folder to the list once it has code.
- Coverage is a signal for missing tests, not a goal. An uncovered branch in domain code means an untested rule.

## Test data
- Builders, not fixtures: `anAppointment().withSlot(...).cancelled().build()` in `test/builders/`. Defaults are valid; tests override only what matters.
- Integration/e2e data is created per test via builders + repositories or the API. The seed script is for local dev only, never for tests.

## Commands
```bash
pnpm test              # unit (domain + application), watch with --watch
pnpm test:int          # integration (Testcontainers)
pnpm test:e2e          # API e2e (Testcontainers + WireMock)
pnpm test:all          # everything, as CI runs it
pnpm test:cov          # coverage report
```
