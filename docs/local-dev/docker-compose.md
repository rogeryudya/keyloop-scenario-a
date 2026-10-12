# Docker Compose

One `docker-compose.yml` at the repo root, two ways to use it:

| Mode | Command | What runs in Docker | Who |
|---|---|---|---|
| **Dev** (default) | `docker compose up -d` | floci, otel-lgtm, wiremock | Developer; API runs on host with `pnpm start:dev` |
| **Full stack** | `docker compose --profile app up --build` | everything above + bootstrap → migrate/seed → API | Reviewer / anyone who just wants it running |

Reviewer needs **only Docker**: no Node, pnpm, AWS CLI or manual steps.

## Startup order (full stack)

```
floci (healthy) ──▶ bootstrap (one-shot: terraform apply → RDS + secrets) ──▶ migrate (one-shot: migrate + seed) ──▶ api (healthy)
otel-lgtm, wiremock ─────────────────────────────────────────────────────────────────────────────────────▶ api
```
Enforced with `depends_on` conditions: `service_healthy` for long-running services and `service_completed_successfully` for one-shot jobs. The API never starts against an unmigrated DB.

## Two DB secrets, one bootstrap
The API reaches floci's RDS proxy under a different host depending on where it runs:

| Secret id | `host` | Used by |
|---|---|---|
| `keyloop/local/db` | `localhost` | API on the host (dev mode) |
| `keyloop/docker/db` | `floci` | API container (full stack) |

`bootstrap` writes both (same port, same credentials), so switching modes needs no re-bootstrap.

## Skeleton
Image versions are pinned in M4. Verify floci's health endpoint and env vars against its docs then.

```yaml
name: keyloop                                   # fixes the network name (keyloop_default) for floci

x-aws-env: &aws-env
  AWS_REGION: us-east-1
  AWS_ACCESS_KEY_ID: test
  AWS_SECRET_ACCESS_KEY: test
  AWS_ENDPOINT_URL: http://floci:4566

services:
  # ---------- dependencies (always) ----------
  floci:
    image: floci/floci:<pinned>
    ports: ["4566:4566", "7001-7099:7001-7099"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - floci-data:/app/data
    environment:
      FLOCI_HOSTNAME: floci
      FLOCI_SERVICES_DOCKER_NETWORK: keyloop_default
      FLOCI_STORAGE_MODE: persistent
      FLOCI_STORAGE_PERSISTENT_PATH: /app/data
    healthcheck: { test: ["CMD-SHELL", "<floci health check>"], interval: 5s, retries: 20 }

  otel-lgtm:
    image: grafana/otel-lgtm:<pinned>
    ports: ["3001:3000", "4317:4317", "4318:4318"]

  wiremock:                                     # only if the brief has external HTTP deps
    image: wiremock/wiremock:<pinned>
    ports: ["8080:8080"]
    volumes: ["./test/wiremock:/home/wiremock"]

  # ---------- full stack (profile: app) ----------
  terraform:                                    # used by `pnpm infra:*` (profile: tools)
    profiles: ["tools"]
    image: hashicorp/terraform:<pinned>
    working_dir: /infra/envs/local
    volumes: ["./infra:/infra", "tf-state:/infra/envs/local/state"]
    environment: { <<: *aws-env }
    depends_on: { floci: { condition: service_healthy } }

  bootstrap:                                    # same image, one-shot apply in full-stack mode
    profiles: ["app"]
    image: hashicorp/terraform:<pinned>
    working_dir: /infra/envs/local
    volumes: ["./infra:/infra", "tf-state:/infra/envs/local/state"]
    entrypoint: ["sh", "-c", "terraform init -input=false && terraform apply -auto-approve -input=false"]
    environment: { <<: *aws-env }
    depends_on: { floci: { condition: service_healthy } }

  migrate:
    profiles: ["app"]
    build: { context: ., target: tools }
    command: ["sh", "-c", "pnpm db:migrate:deploy && pnpm db:seed"]
    environment: { <<: *aws-env, DB_SECRET_ID: keyloop/docker/db }
    depends_on: { bootstrap: { condition: service_completed_successfully } }

  api:
    profiles: ["app"]
    build: { context: ., target: runtime }
    ports: ["3000:3000"]
    environment:
      <<: *aws-env
      NODE_ENV: production
      PORT: "3000"
      DB_SECRET_ID: keyloop/docker/db
      OTEL_SERVICE_NAME: keyloop-api
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-lgtm:4318
    depends_on:
      migrate: { condition: service_completed_successfully }
      otel-lgtm: { condition: service_started }
    healthcheck: { test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"], interval: 5s, retries: 20 }

  # ---------- optional (profile: datadog) ----------
  datadog-agent:
    profiles: ["datadog"]
    image: datadog/agent:<pinned>
    environment:
      DD_API_KEY: ${DD_API_KEY:?set DD_API_KEY to use the datadog profile}
      DD_SITE: ${DD_SITE:-datadoghq.com}
      DD_APM_ENABLED: "true"
      DD_OTLP_CONFIG_RECEIVER_PROTOCOLS_HTTP_ENDPOINT: 0.0.0.0:4318

volumes:
  floci-data:
  tf-state:
```

## Dockerfile (multi-stage)
| Stage | Contents | Used by |
|---|---|---|
| `deps` | `pnpm install --frozen-lockfile` | other stages |
| `build` | `prisma generate` + `nest build` | `runtime` |
| `tools` | full source + dev deps (Prisma CLI, scripts) | `migrate` |
| `runtime` | `node:24-alpine`, prod deps + `dist/` + Prisma client, non-root user, `HEALTHCHECK` | `api` |

The runtime image contains no dev dependencies, scripts or `.env`.

## Rules
- Pin every image version; never `:latest`.
- No real secrets in `docker-compose.yml`; the `test`/`test` AWS keys are floci dummies. Datadog key comes from the shell env.
- One-shot jobs must be idempotent: running `up` twice must not fail or duplicate seed data.
- The full-stack mode is checked from a clean state before each milestone is marked done: `docker compose --profile app down -v && docker compose --profile app up --build`.

## Reviewer quickstart (goes into the root README)
```bash
docker compose --profile app up --build
# API:     http://localhost:3000/docs
# Grafana: http://localhost:3001  (traces, logs, metrics)
# Stop + clean: docker compose --profile app down -v
```
Prerequisite: Docker Desktop with the Docker socket available to containers (floci needs it to start the Postgres container).
