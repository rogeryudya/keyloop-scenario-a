# Observability (local and beyond)

## Decision in one line
Instrument with **OpenTelemetry** (vendor-neutral). Locally, export to **Grafana LGTM** (free, no account).

## Local stack
```yaml
  otel-lgtm:
    image: grafana/otel-lgtm:<pinned-version>
    ports:
      - "3001:3000"     # Grafana (3000 is the API)
      - "4317:4317"     # OTLP gRPC
      - "4318:4318"     # OTLP HTTP
```
Grafana includes Tempo (traces), Loki (logs) and Prometheus (metrics), pre-wired.

## Production backends
The app only speaks OTLP, so the same traces, logs and metrics can go to any OTLP backend with **no code change**:
set `OTEL_EXPORTER_OTLP_ENDPOINT` to its collector. Examples are a Datadog Agent with OTLP ingest, Grafana Cloud, or
the AWS Distro for OpenTelemetry. `envs/aws-dev` exposes this as `otel_exporter_otlp_endpoint`. Nothing beyond
otel-lgtm is part of the local stack. An optional Datadog Agent profile existed in M5, but it needed a personal API key
and was never verified, so it was removed.

## What we instrument
| Signal | How | What you see |
|---|---|---|
| Traces | `@opentelemetry/sdk-node` + `http` and `pg` instrumentations (Prisma queries go through `pg`) | One trace per request: HTTP → handler → SQL |
| Use-case spans | Span per command/query handler, e.g. `command CreateAppointment`, with `cqrs.kind`, `cqrs.name`, `outcome` (`success`, `invalid`, `not_found`, `conflict`, `rejected`, `error`) and `error.code` for a business rejection ([ADR-0008](../decisions/0008-handler-tracing-bus-wrapper.md)) | Business-level steps inside the trace |
| Logs | Structured JSON (pino via `nestjs-pino`) on stdout, also sent over OTLP to Loki. One `request completed` line per request (method, url, status, `responseTime`; never headers or bodies) with `request_id`, `trace_id`, `span_id`. Level: 5xx error, 4xx warn, else info | Jump from a log line to its trace in Grafana |
| Metrics | Auto: `http_server_request_duration_seconds` (rate, latency, errors by status). Business counters (`BookingMetrics` port, OTel adapter): `appointments_created_total` (idempotent replays excluded), `appointment_rejections_total{reason=<error code>}`, `appointment_conflict_retries_total`. Exported every `OTEL_METRIC_EXPORT_INTERVAL` ms (10 s locally) | Dashboards and alerts |

Rules:
- Tracing is initialised in `src/instrumentation.ts`, the first import in `main.ts`, so it patches modules before Nest and Prisma load them. It is **on only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set** (`.env.example` points at otel-lgtm; Compose sets it for `api`). `OTEL_SDK_DISABLED=true` turns it off. `/health` is not traced.
- No Express/Nest auto-instrumentation: Nest 12 is ESM-only and loads express outside the require hook, so the HTTP root span is named by method only (`POST`). Filter by `span.cqrs.name` or `span.outcome` instead.
- On SIGTERM/SIGINT the app closes, then flushes pending spans and logs before exiting.
- **Request id:** the `x-request-id` request header is reused when it is a plain token (`[A-Za-z0-9_.:-]`, up to 128 chars), otherwise a UUID is generated. It is returned in the `x-request-id` response header, bound to every log line of the request as `request_id`, and set on the HTTP span as `request.id`.
- `/health` is neither traced nor logged per request. `LOG_LEVEL` sets the level (default `info`, `silent` in tests).
- The handler span wrapper is a cross-cutting concern: a small decorator/interceptor, not code inside each handler (see `../architecture/application.md`).
- Never put PII, secrets or full request bodies into span attributes or logs.
- Telemetry is disabled in tests (no endpoint), so tests stay fast. `handler-tracing.spec.ts` asserts handler spans with an in-memory exporter.

## Observing while testing
- **Manual / exploratory:** run the app locally, hit endpoints (Swagger or `.http` files), open Grafana (http://localhost:3001) → Explore → Tempo, and query e.g. `{resource.service.name="keyloop-api" && span.outcome="conflict"}`. Each request shows the handler span and the SQL statements, which is a good way to spot N+1 queries or missing transactions.
- **Logs:** Grafana → Explore → Loki: `{service_name="keyloop-api"} | request_id="<id>"` or `| trace_id="<id>"` (`request_id`, `trace_id` and the other fields are structured metadata, so filter with `|`, not `|=`). Without Grafana: `docker compose logs api`.
- **Metrics:** Grafana → Explore → Prometheus, e.g. `sum by (reason) (increase(appointment_rejections_total[15m]))` or `histogram_quantile(0.95, sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))`. A counter appears only after its first increment.
- **Automated (optional, for critical flows):** an integration test can register an `InMemorySpanExporter` and assert that, e.g., `command CreateAppointment` produced a span with `outcome=conflict` on a double booking. Use sparingly; it is a test of instrumentation, not of business logic.
- **Request correlation:** e2e tests can assert that responses carry an `x-request-id` header and that error responses include the same id in logs.
