# Integration and e2e tests

## Infrastructure: Testcontainers
`pnpm test:int` and `pnpm test:e2e` use Jest `globalSetup` to:
1. Start `postgres:<same major version as RDS>` via `@testcontainers/postgresql` (random host port).
2. Run `prisma migrate deploy` against it.
3. Expose `DATABASE_URL` to tests; `globalTeardown` stops the container.

Why not floci RDS for tests: slower start, dynamic proxy ports, needs the Docker socket and a bootstrap step. Plain Postgres gives the same engine with less moving parts. Pin the same Postgres major version as the floci/RDS instance.

Requirements: Docker running. Nothing else (no Compose stack, no bootstrap).

## DB isolation
- Tests run **serially** against the shared container (`--runInBand`), simplest and reliable.
- `beforeEach`: `TRUNCATE` all app tables `RESTART IDENTITY CASCADE` (helper `resetDb()` in `test/helpers/db.ts`). Excludes `_prisma_migrations`.
- Each test creates exactly the data it needs via builders.

## Repository integration tests (`*.int-spec.ts`)
Prove what fakes can't:
- Mapper round-trip: `save(entity)` → `findById` → equal snapshot.
- DB constraints fire and are translated: unique violation → `AppointmentConflictError`.
- Queries: filters, cursor pagination order and boundaries (`nextCursor` null on last page, stable with equal `createdAt`).

### Repository contract tests
One shared suite run against both the Prisma adapter and the in-memory fake:
```ts
// test/contracts/appointment-repository.contract.ts
export function appointmentRepositoryContract(make: () => Promise<AppointmentRepository>) {
  it('returns null for an unknown id', async () => { ... });
  it('finds overlapping appointments for the same technician only', async () => { ... });
}
// prisma-appointment.repository.int-spec.ts → appointmentRepositoryContract(() => makePrismaRepo())
// in-memory-appointment.repository.spec.ts → appointmentRepositoryContract(async () => new InMemoryAppointmentRepository())
```

## Transactions and concurrency
- Transaction test: a handler that fails after the first write leaves **no** rows behind.
- Race test for invariants like double booking: fire N identical commands in parallel through the real handler + Prisma adapter; assert exactly one succeeds and the others fail with the conflict error (proves the DB constraint/lock, not just the in-memory check).

## Secrets Manager credential loading (floci)
One integration suite, `src/config/db-credentials.provider.int-spec.ts`. Set `SKIP_FLOCI_TESTS=1` to skip it where Testcontainers can't start extra containers:
- Starts floci via Testcontainers (`floci/floci:2.2.0`, same as Compose; waits on `/_floci/health`). Secrets Manager doesn't need the Docker socket.
- Creates RDS-format secrets that point at the Testcontainers Postgres.
- Boots `AppConfigModule` + `PrismaModule` with `DB_SECRET_ID` (and a wrong `DATABASE_URL`, to prove precedence) and queries the DB.
- Asserts a clear error for: missing secret, malformed JSON, missing fields (without echoing values), binary secret, and Secrets Manager unreachable.

## e2e (API) tests (`test/e2e/*.e2e-spec.ts`)
App factory `test/helpers/app.ts` builds the real `AppModule` with the same global setup as `main.ts` (versioning, `ValidationPipe`, exception filter). Use a shared `configureApp(app)` function so tests and production can't diverge.

Per endpoint, cover:
- happy path: status, response shape, `Location`/ids
- validation: bad body → 400 with `details[]`
- not found → 404; conflict / business rule → 409 / 422 with the right `code`
- versioning: route only reachable under `/v1`
- list endpoints: `limit`, `cursor`, `nextCursor`, invalid cursor → 400 `INVALID_CURSOR`

```ts
it('POST /v1/appointments returns 409 APPOINTMENT_CONFLICT for an overlapping slot', async () => {
  await request(app.getHttpServer()).post('/v1/appointments').send(validBody).expect(201);
  const res = await request(app.getHttpServer()).post('/v1/appointments').send(validBody).expect(409);
  expect(res.body.error.code).toBe('APPOINTMENT_CONFLICT');
});
```

External HTTP dependencies in e2e → WireMock; see [test-doubles.md](test-doubles.md).

## CI
`pnpm test:all` = lint → typecheck → unit → integration → e2e. Runs on any runner with Docker; no AWS credentials needed.
