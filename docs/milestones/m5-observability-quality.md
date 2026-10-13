# M5 — Observability and quality

**Status:** `done`
**Goal:** appointment behaviour is visible in traces, logs and metrics, and test coverage of the critical paths is complete.
**Requirements:** NFR-3, NFR-5

## Tasks
- [x] OpenTelemetry: `instrumentation.ts`, auto-instrumentation (HTTP, Prisma/pg), a span per command/query handler with outcome attribute; traces visible in local Grafana
- [x] Structured logging (pino) with request id + trace id correlation
- [x] Business metrics: `appointments_created_total`, `appointment_rejections_total{reason}`, `appointment_conflict_retries_total`
- [x] ~~Optional Datadog Compose profile documented and verified with a trial key~~ dropped: profile removed (see Notes)
- [x] Coverage review: domain + application ≥ 90%; add tests for any uncovered rule branch
- [x] Light load check: script firing ~200 concurrent booking requests; confirm no double-booking and record latency in design notes

## Acceptance criteria
- A rejected booking (409) shows up in Grafana as a trace with the reason, a log line with the same trace id, and a metric increment
- Coverage gate passes in CI

## Notes
- WireMock is not needed: the brief has no external dependencies (requirements A-10).
- Task 1: tracing verified on the full Compose stack. A 409 booking shows in Tempo as `POST` (409) → `command CreateAppointment` (`outcome=conflict`, `error.code=NO_SERVICE_BAY_AVAILABLE`) → every `pg.query` up to `ROLLBACK`. `docker compose stop api` exits 0 after the span flush. Handler spans come from a bus wrapper ([ADR-0008](../decisions/0008-handler-tracing-bus-wrapper.md)).
- Gotcha: `@opentelemetry/instrumentation-express` produced no spans, because Nest 12 (ESM) imports express outside the require hook. It was dropped, so HTTP root spans have no `http.route` (named `POST`/`GET` only). Follow-up candidate for the logging task: set `http.route` on the active HTTP span from a Nest interceptor.
- Gotcha: `instrumentation.ts` runs before `reflect-metadata`, so it must not import decorated classes. `.env` loading lives in `src/config/dotenv.ts` for that reason.
- New dependencies: `@opentelemetry/api` (tracing API used by the handler wrapper), `@opentelemetry/sdk-node` (SDK + OTLP exporter), `@opentelemetry/instrumentation-http` and `-pg` (HTTP and SQL spans); dev: `@opentelemetry/sdk-trace-base` (in-memory exporter for tests).
- Task 2: verified on the Compose stack. A 409 booking sent with `x-request-id: verify-m5-logs-2` returns the same header. Its `request completed` line (level `warn`) is on stdout and in Loki with that `request_id` and the same `trace_id` as its trace in Tempo. New dependencies: `nestjs-pino` + `pino-http` + `pino` (structured request logging and Nest logger bridge), `@opentelemetry/instrumentation-pino` (adds `trace_id`/`span_id` and ships logs over OTLP).
- Gotcha: pino-http puts the request id inside `req`, so a custom `req` serializer drops it. `request_id` is bound with `customProps` instead, which also tags any log written during the request.
- Task 3: verified on the Compose stack. One 409, one 201 and one 404 booking give `appointments_created_total 1`, `appointment_rejections_total{reason="NO_SERVICE_BAY_AVAILABLE"} 1` and `{reason="VEHICLE_NOT_FOUND"} 1` in Prometheus; `http_server_request_duration_seconds` comes from the HTTP instrumentation. The handler reports through a `BookingMetrics` port, so the application layer has no OTel import. A 409 now shows as a trace, a log line with the same trace id, and a metric increment, which meets the first acceptance criterion. New dev dependency: `@opentelemetry/sdk-metrics` (in-memory meter for the adapter test).
- Task 4 (open, needs the repo owner): the `datadog` Compose profile (`datadog/agent:7.83.3`, OTLP ingest for traces, metrics and logs) and its usage are in `docs/local-dev/observability.md`. Checked with a dummy key: compose config is valid for every profile combination, the agent's OTLP receiver runs, the app exports to it with `OTEL_EXPORTER_OTLP_ENDPOINT_DOCKER=http://datadog-agent:4318`, and the agent forwards the logs (403 with the dummy key). Still pending: a run with a real trial `DD_API_KEY` to see the data in Datadog. `DD_API_KEY` uses `:-`, not `:?`, because `:?` fails every `docker compose` command when the key is unset, even without the profile.
- Task 5: domain + application coverage was already above 90% in every folder (lowest: `shared/application` at 94.7% branches). The remaining uncovered branches are defensive guards that real inputs can't reach (equal ids in a comparator, a `noUncheckedIndexedAccess` guard, an `Intl` part fallback), except the availability rethrow, which now has a test (an allocator bug isn't read as "slot not free"). The gate is `coverageThreshold` per folder in `jest.config.js`, enforced by `pnpm test:cov` in the CI `unit` job; checked that it fails (exit 1) when a threshold isn't met.
- Task 6: `pnpm load:booking` (200 concurrent bookings on 8 overlapping slots) ran three times on the Compose stack: 8/8/7 created, the rest `409 NO_TECHNICIAN_AVAILABLE`, no 5xx, no double-booking, every 201 stored, 13 conflict retries in total. p50 1.4–1.8 s and p99 1.9–2.7 s under that burst. Results and analysis are in `docs/design-notes.md` › Load check (the rest of that file comes with M6).
- Fix (PR #6 CI): the concurrency int test was flaky on CI (once on main after M3, twice on this PR). After the test was changed to print rejection reasons, the cause showed up: Prisma `P2034` (Postgres deadlock 40P01) between two concurrent inserts racing on the exclusion constraint. The repository now treats it as a lost race (`AppointmentConflictError` → bounded retry), like 23P01 and P2002. See ADR-0006 › Consequences.
- Task 4 dropped (2026-10-13): the `datadog` Compose profile and the `OTEL_EXPORTER_OTLP_ENDPOINT_DOCKER` override were removed. The profile needed a personal API key and was only ever checked with a dummy key. The app still exports plain OTLP, so a production backend (Datadog Agent, Grafana Cloud, ADOT) is a deployment setting: `OTEL_EXPORTER_OTLP_ENDPOINT`, or `otel_exporter_otlp_endpoint` in `envs/aws-dev`. With this, M5 is done.
