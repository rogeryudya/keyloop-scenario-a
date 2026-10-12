# M5 — Observability and quality

**Status:** `in-progress`
**Goal:** appointment behaviour is visible in traces, logs and metrics, and test coverage of the critical paths is complete.
**Requirements:** NFR-3, NFR-5

## Tasks
- [x] OpenTelemetry: `instrumentation.ts`, auto-instrumentation (HTTP, Prisma/pg), a span per command/query handler with outcome attribute; traces visible in local Grafana
- [ ] Structured logging (pino) with request id + trace id correlation
- [ ] Business metrics: `appointments_created_total`, `appointment_rejections_total{reason}`, `appointment_conflict_retries_total`
- [ ] Optional Datadog Compose profile documented and verified with a trial key
- [ ] Coverage review: domain + application ≥ 90%; add tests for any uncovered rule branch
- [ ] Light load check: script firing ~200 concurrent booking requests; confirm no double-booking and record latency in design notes

## Acceptance criteria
- A rejected booking (409) shows up in Grafana as a trace with the reason, a log line with the same trace id, and a metric increment
- Coverage gate passes in CI

## Notes
- WireMock is not needed: the brief has no external dependencies (requirements A-10).
- Task 1: tracing verified on the full Compose stack. A 409 booking shows in Tempo as `POST` (409) → `command CreateAppointment` (`outcome=conflict`, `error.code=NO_SERVICE_BAY_AVAILABLE`) → every `pg.query` up to `ROLLBACK`. `docker compose stop api` exits 0 after the span flush. Handler spans come from a bus wrapper ([ADR-0008](../decisions/0008-handler-tracing-bus-wrapper.md)).
- Gotcha: `@opentelemetry/instrumentation-express` produced no spans, because Nest 12 (ESM) imports express outside the require hook. It was dropped, so HTTP root spans have no `http.route` (named `POST`/`GET` only). Follow-up candidate for the logging task: set `http.route` on the active HTTP span from a Nest interceptor.
- Gotcha: `instrumentation.ts` runs before `reflect-metadata`, so it must not import decorated classes. `.env` loading lives in `src/config/dotenv.ts` for that reason.
- New dependencies: `@opentelemetry/api` (tracing API used by the handler wrapper), `@opentelemetry/sdk-node` (SDK + OTLP exporter), `@opentelemetry/instrumentation-http` and `-pg` (HTTP and SQL spans); dev: `@opentelemetry/sdk-trace-base` (in-memory exporter for tests).
