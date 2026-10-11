# 0003 — Local environment and test infrastructure

- **Status:** accepted
- **Date:** 2026-10-12

## Context
The target platform is AWS (RDS Postgres, credentials in Secrets Manager). We want local runs to exercise the
same credential path as production, observability visible locally, and external HTTP dependencies stubbed, all
without an AWS account or paid tooling. Automated tests must stay fast and runnable in CI with only Docker.

## Decision
- **Local run:** API on the host; floci (MIT, no auth token) emulates RDS (real Postgres) and Secrets Manager. The app resolves DB credentials from Secrets Manager via `DB_SECRET_ID`; `AWS_ENDPOINT_URL` points the SDK at floci.
- **Automated tests:** Testcontainers Postgres (same major version) with `DATABASE_URL` injected; one integration test covers the Secrets Manager path against floci.
- **Observability:** OpenTelemetry instrumentation; local export to `grafana/otel-lgtm`. Datadog is an optional Compose profile (agent + OTLP ingest), requiring the developer's own API key.
- **External HTTP:** WireMock (Compose for local run, Testcontainers for tests), only if the brief has external dependencies.

## Alternatives considered
- LocalStack: RDS and auth-token requirements make it less suitable; floci covers what we need for free.
- Plain Postgres in Compose with `DATABASE_URL` for local run: simpler, but skips the Secrets Manager path that production uses.
- floci for automated tests: slower, dynamic ports, Docker-socket dependency; poor CI fit.
- `dd-trace` directly: ties code to Datadog; OTel keeps it vendor-neutral and Datadog still ingests it.
- `nock`/`msw` instead of WireMock: in-process only, doesn't exercise the real HTTP client or serve the local run.

## Update
Provisioning of RDS + secrets moved from an SDK bootstrap script to Terraform; see [0004](0004-terraform-ecs.md).

## Consequences
- Two DB credential modes (`DB_SECRET_ID` or `DATABASE_URL`), handled in one provider; startup fails if neither is set.
- Local setup needs Docker with socket access for floci, plus a one-off bootstrap step.
- Datadog dashboards can't be shown without an account; Grafana is the default demo.
