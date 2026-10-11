# M5 — Observability and quality

**Status:** `todo`
**Goal:** appointment behaviour is visible in traces, logs and metrics, and test coverage of the critical paths is complete.
**Requirements:** NFR-3, NFR-5

## Tasks
- [ ] OpenTelemetry: `instrumentation.ts`, auto-instrumentation (HTTP, Prisma/pg), a span per command/query handler with outcome attribute; traces visible in local Grafana
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
