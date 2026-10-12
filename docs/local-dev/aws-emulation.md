# AWS emulation with floci (RDS + Secrets Manager)

[floci](https://floci.io) emulates AWS on `:4566`. It is MIT-licensed and needs no auth token. RDS runs a **real
Postgres container** behind a TCP proxy, so the app talks to a genuine Postgres.

## Docker Compose (floci service)
The actual service, including the healthcheck, is in the root `docker-compose.yml`; this is the essence.
```yaml
services:
  floci:
    image: floci/floci:2.2.0                    # pinned; don't use :latest
    ports:
      - "4566:4566"
      - "7001-7099:7001-7099"                  # RDS proxy ports
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock   # floci starts the Postgres container
      - floci-data:/app/data
    environment:
      FLOCI_HOSTNAME: floci
      FLOCI_SERVICES_DOCKER_NETWORK: keyloop_default
      FLOCI_STORAGE_MODE: persistent
      FLOCI_STORAGE_PERSISTENT_PATH: /app/data
      FLOCI_SERVICES_RDS_DEFAULT_POSTGRES_IMAGE: postgres:17-alpine
      FLOCI_SERVICES_UI_ENABLED: "false"

volumes:
  floci-data:
```
Notes:
- The RDS endpoint port is **dynamic** (7001–7099), not 5432. Never hard-code it; read it from the RDS API / the secret.
- On Windows, Docker Desktop must expose the Docker socket to containers.
- floci's RDS uses `postgres:16-alpine` by default. We override it to `postgres:17-alpine` to match Testcontainers.
  The RDS API still reports `EngineVersion` 16.x unless the instance sets `engine_version` explicitly.
- The instance's `Endpoint.Address` is an internal container IP, which isn't reachable from the host. That's why the
  secrets set `host` to `localhost` / `floci` themselves and only take the port from the instance.
- Health: `GET /_floci/health` (also `/_localstack/health`). The native image has `bash` but no `curl`/`wget`, so the
  Compose healthcheck makes a raw HTTP request over `/dev/tcp`.
- Verified on Windows 11 + Docker Desktop (M4 spike): an instance created through the RDS API becomes `available`
  within seconds. `prisma migrate deploy` + seed work from the host through `localhost:<port>`, and a container on
  `keyloop_default` reaches it through `floci:<port>`. With `persistent` storage, the instance, port, secrets and data
  survive `docker compose restart floci`. floci removes its RDS containers on shutdown, so `docker compose down -v`
  leaves nothing behind.

## Provisioning (`pnpm infra:up` → Terraform)
The RDS instance and DB secrets are created by Terraform (`infra/envs/local`), run in a container, so there's no local install. Full details: [../infrastructure.md](../infrastructure.md).

- Idempotent: re-running `infra:up` converges; it never duplicates.
- Creates secrets `keyloop/local/db` (host `localhost`, API on host) and `keyloop/docker/db` (host `floci`, API container), in the **RDS secret format**:
  ```json
  { "engine": "postgres", "host": "localhost", "port": 7001,
    "username": "keyloop", "password": "<random>", "dbname": "keyloop" }
  ```
- The port is whatever proxy port floci assigned. Terraform reads it from the instance, so it's never hard-coded.
- `envs/local` only ever targets floci (`AWS_ENDPOINT_URL` + dummy credentials); real AWS has its own env folder.

Fallback if floci's RDS doesn't work through Terraform: a small AWS SDK script doing the same steps (`scripts/local/bootstrap-aws.ts`). Record that in an ADR if used.

## How the app gets DB credentials
Same code path locally and in AWS; only env vars differ.

```
bootstrap (main.ts)
 → ConfigModule validates env
 → DbCredentialsProvider:
      if DB_SECRET_ID      → SecretsManager.getSecretValue → parse RDS secret JSON
      else if DATABASE_URL → use as-is   (tests / CI only)
      else                 → fail fast
 → build Postgres URL → construct PrismaClient with it
```
- Lives in `src/config/` + `shared/infrastructure/prisma/`. Nothing else knows about Secrets Manager.
- The secret is fetched **once at startup** and never logged. Rotation is out of scope; document it as a known limitation.
- AWS SDK v3 picks up `AWS_ENDPOINT_URL` automatically, so there is no `if local` branch in code.

## Migrations and seed
Prisma CLI needs `DATABASE_URL` in the environment. `pnpm db:migrate` / `pnpm db:seed` run `scripts/local/with-db-url.ts`, which resolves the secret the same way the app does, sets `DATABASE_URL` for the child process, then runs the Prisma command.

## Why not use floci for automated tests?
Tests use a plain Postgres container instead (see `../testing/integration-and-e2e.md`): faster start, a fixed port, no Docker-socket dependency, and it runs the same in CI. The Secrets Manager credential path is covered by one dedicated integration test against floci.
