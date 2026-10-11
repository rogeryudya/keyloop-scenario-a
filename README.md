# Keyloop Backend Assignment

Backend service built with NestJS, TypeScript, PostgreSQL and Prisma.

> Work in progress. See [docs/milestones/](docs/milestones/README.md).

## Run it (only Docker needed)
```bash
docker compose --profile app up --build
```
- API docs: http://localhost:3000/docs
- Grafana (traces, logs, metrics): http://localhost:3001
- Stop and clean up: `docker compose --profile app down -v`

Developing locally (API on host, hot reload): see [docs/local-dev/](docs/local-dev/README.md).

## Docs
- [Requirements](docs/requirements.md)
- [Architecture](docs/architecture/README.md)
- [Conventions](docs/conventions.md)
- [API](docs/api.md)
- [Data dictionary](docs/data-dictionary.md)
- [Decisions](docs/decisions/)
- [CI](docs/ci.md)
- [Infrastructure (Terraform)](docs/infrastructure.md)
