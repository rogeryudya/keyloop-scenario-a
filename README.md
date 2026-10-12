# Keyloop Backend Assignment

Backend service built with NestJS, TypeScript, PostgreSQL and Prisma.

> Work in progress. See [docs/milestones/](docs/milestones/README.md).

## Run it (only Docker needed)
```bash
docker compose --profile app up --build
```
This starts AWS emulation (floci: RDS + Secrets Manager), provisions the database and its secret with Terraform,
runs migrations and seed data, then starts the API, which reads its DB credentials from Secrets Manager. The first
run takes a few minutes (image builds plus about 1.5 minutes of RDS provisioning).

- API docs (Swagger): http://localhost:3000/docs. Try `POST /v1/appointments` with the example body.
- Health: http://localhost:3000/health
- Grafana: http://localhost:3001 (OpenTelemetry wiring arrives in M5)
- AWS console (floci): http://localhost:4566/_floci/ui shows the RDS instance and DB secrets
- Stop and clean up: `docker compose --profile app down -v`

Prerequisites: Docker with Compose v2, and the Docker socket available to containers (floci starts the Postgres
container through it). On Podman, run `DOCKER_BUILDKIT=0 docker compose --profile app up --build`.

## Develop (API on the host, hot reload)
Needs Node 24 and pnpm (via corepack).
```bash
pnpm install
cp .env.example .env      # DB_SECRET_ID + floci endpoint; no real secrets
docker compose up -d      # floci, otel-lgtm
pnpm infra:up             # Terraform in Docker → RDS + DB secrets (idempotent)
pnpm db:migrate && pnpm db:seed
pnpm start:dev            # http://localhost:3000/docs
```
Tests: `pnpm test` (unit), `pnpm test:int` and `pnpm test:e2e` (Testcontainers, need Docker). Details:
[docs/local-dev/](docs/local-dev/README.md), [docs/testing/](docs/testing/README.md).

## Docs
- [Requirements](docs/requirements.md)
- [Architecture](docs/architecture/README.md)
- [Conventions](docs/conventions.md)
- [API](docs/api.md)
- [Data dictionary](docs/data-dictionary.md)
- [Decisions](docs/decisions/)
- [CI](docs/ci.md)
- [Infrastructure (Terraform)](docs/infrastructure.md)
