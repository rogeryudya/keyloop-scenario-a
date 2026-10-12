# Local development environment

Goal: run the API on the host machine against an AWS-like environment (RDS + Secrets Manager emulated by floci),
with traces/logs/metrics visible locally. No WireMock: the brief has no external HTTP dependencies (requirements A-10).
Rationale: [../decisions/0003-local-environment.md](../decisions/0003-local-environment.md).

## Topology

```
 Host machine
 ┌──────────────────────────┐
 │ API (pnpm start:dev)     │──── AWS SDK (AWS_ENDPOINT_URL) ───▶ floci :4566  ── Secrets Manager
 │ NestJS on :3000          │                                         │
 │                          │──── Postgres (host/port from secret) ─▶ floci RDS proxy :7001-7099
 │                          │                                         └─▶ real Postgres container
 │                          │──── OTLP :4318 ──────────────────────▶ otel-lgtm (Grafana :3001)
 └──────────────────────────┘
 Docker Compose: floci, otel-lgtm
```

The API itself runs outside Docker (fast reload, debugger). Everything it depends on runs in Compose.

## Ports
| Service | Port | Notes |
|---|---|---|
| API | 3000 | `/v1/...`, `/health`, `/docs` |
| floci (AWS APIs) | 4566 | Secrets Manager, RDS control plane |
| floci RDS proxy | 7001–7099 | Actual Postgres connection; port is assigned per instance |
| floci web console | 4500 | Open via http://localhost:4566/_floci/ui (sidecar starts on first visit): RDS instances, secrets, logs |
| Grafana (otel-lgtm) | 3001 | Traces (Tempo), logs (Loki), metrics (Prometheus) |
| OTLP | 4317 gRPC / 4318 HTTP | Telemetry ingest |

## Just want it running? (reviewers)
```bash
docker compose --profile app up --build
```
Everything (AWS emulation, DB bootstrap, migrations, seed, API, Grafana) runs in Docker. See [docker-compose.md](docker-compose.md).

## First-time setup (developers: API on host)
```bash
pnpm install
cp .env.example .env                 # local defaults, no real secrets
docker compose up -d                 # floci, otel-lgtm
pnpm infra:up                        # Terraform (in Docker) → RDS + DB secrets in floci (idempotent)
pnpm db:migrate                      # resolves secret → runs prisma migrate
pnpm db:seed
pnpm start:dev
```
Open: API docs http://localhost:3000/docs · Grafana http://localhost:3001 · AWS console (floci) http://localhost:4566/_floci/ui

## Daily use
```bash
docker compose up -d && pnpm start:dev
```
floci runs with persistent storage, so the RDS instance and secret survive restarts. To start clean:
`docker compose down -v && docker compose up -d && pnpm infra:up && pnpm db:migrate`.

## `.env` (local)
```dotenv
NODE_ENV=development
PORT=3000

# AWS → floci
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
AWS_ENDPOINT_URL=http://localhost:4566     # AWS SDK v3 honours this; unset in real AWS

# DB credentials come from Secrets Manager, never from .env
DB_SECRET_ID=keyloop/local/db

# Observability
OTEL_SERVICE_NAME=keyloop-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
LOG_LEVEL=debug

# External APIs → WireMock (only if the brief has external dependencies)
# EXTERNAL_X_BASE_URL=http://localhost:8080
```

## Details
- [docker-compose.md](docker-compose.md): dev vs full-stack mode, startup order, Dockerfile stages
- [aws-emulation.md](aws-emulation.md): floci Compose config, provisioning, how the app resolves DB credentials
- [../infrastructure.md](../infrastructure.md): Terraform modules and envs (local floci, real-AWS shape), ECS stretch goal
- [observability.md](observability.md): OpenTelemetry locally, Datadog option, what to look at
- [../testing/README.md](../testing/README.md): how tests use (and don't use) this environment

## Troubleshooting
| Symptom | Check |
|---|---|
| `ECONNREFUSED :4566` | `docker compose ps`; floci up? |
| DB connection refused | RDS port changed after a reset → re-run `pnpm infra:up` (it rewrites the secret) |
| RDS instance never becomes available | floci needs `/var/run/docker.sock` mounted (Docker Desktop: enable it in settings on Windows) |
| No traces in Grafana | `OTEL_EXPORTER_OTLP_ENDPOINT` set? Tracing must be initialised **before** Nest boots (see observability.md) |
