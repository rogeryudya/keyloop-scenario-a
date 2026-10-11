# Observability (local and beyond)

## Decision in one line
Instrument with **OpenTelemetry** (vendor-neutral). Locally, export to **Grafana LGTM** (free, no account). In a real deployment the same telemetry can go to **Datadog** through the Datadog Agent's OTLP ingest, with no code change.

## Can we use Datadog locally?
Yes, but it is **not fully local**:
- Run the `datadog/agent` container next to the app, and the app sends traces to it (`dd-trace` or OTLP).
- The agent forwards everything to Datadog SaaS, so you need a Datadog account and `DD_API_KEY` (a trial works), and you view data in the Datadog web UI, not on localhost.
- Fine for demonstrating Datadog dashboards/APM. Not suitable as the default dev loop or for reviewers who don't have an account.

So: default to OTel + LGTM. Datadog is an optional Compose profile (`docker compose --profile datadog up -d`) that you enable with your own `DD_API_KEY`.

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

Optional Datadog profile:
```yaml
  datadog-agent:
    image: datadog/agent:<pinned-version>
    profiles: ["datadog"]
    environment:
      DD_API_KEY: ${DD_API_KEY}
      DD_SITE: datadoghq.eu        # or datadoghq.com
      DD_APM_ENABLED: "true"
      DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT: 0.0.0.0:4318
    ports: ["8126:8126"]
```
When this profile is on, point `OTEL_EXPORTER_OTLP_ENDPOINT` at the agent instead of otel-lgtm (only one can own 4318).

## What we instrument
| Signal | How | What you see |
|---|---|---|
| Traces | `@opentelemetry/sdk-node` + auto-instrumentations (http, express/nest, pg/prisma) | One trace per request: controller → handler → SQL |
| Use-case spans | Manual span per command/query handler: `command CreateAppointment` with attributes (`appointment.id`, outcome) | Business-level steps inside the trace |
| Logs | Structured JSON (pino) with `trace_id`, `span_id`, `request_id` | Jump from a log line to its trace in Grafana |
| Metrics | Request rate/latency/errors (auto) + a few business counters (`appointments_created_total`, `appointment_conflicts_total`) | Dashboards |

Rules:
- Tracing is initialised in `src/instrumentation.ts`, loaded **before** Nest (`node -r ./dist/instrumentation.js` or the first import in `main.ts`). Otherwise auto-instrumentation misses modules.
- The handler span wrapper is a cross-cutting concern: a small decorator/interceptor, not code inside each handler (see `../architecture/application.md`).
- Never put PII, secrets or full request bodies into span attributes or logs.
- Telemetry is disabled in unit tests (no exporter configured) so tests stay fast.

## Observing while testing
- **Manual / exploratory:** run the app locally, hit endpoints (Swagger or `.http` files), open Grafana → Explore → Tempo, filter by `service.name=keyloop-api`. Each request shows the handler span and the SQL statements, which is a good way to spot N+1 queries or missing transactions.
- **Automated (optional, for critical flows):** an integration test can register an `InMemorySpanExporter` and assert that, e.g., `command CreateAppointment` produced a span with `outcome=conflict` on a double booking. Use sparingly; it is a test of instrumentation, not of business logic.
- **Request correlation:** e2e tests can assert that responses carry an `x-request-id` header and that error responses include the same id in logs.
