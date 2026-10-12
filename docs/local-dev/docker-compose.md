# Docker Compose

One `docker-compose.yml` at the repo root, two ways to use it:

| Mode | Command | What runs in Docker | Who |
|---|---|---|---|
| **Dev** (default) | `docker compose up -d` | floci, otel-lgtm | Developer; API runs on host with `pnpm start:dev` |
| **Full stack** | `docker compose --profile app up --build` | everything above + bootstrap → migrate/seed → API | Reviewer / anyone who just wants it running |

Reviewer needs **only Docker**: no Node, pnpm, AWS CLI or manual steps.

## Startup order (full stack)

```
floci (healthy) ──▶ bootstrap (one-shot: terraform apply → RDS + secrets) ──▶ migrate (one-shot: migrate + seed) ──▶ api (healthy)
otel-lgtm ───────────────────────────────────────────────────────────────────────────────────────────────▶ api
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
Images are pinned (floci `2.2.0`, otel-lgtm `0.36.0`, terraform `1.16.5`, node `24.21.0-alpine3.24`). The real file is the root `docker-compose.yml`; this is a condensed view.
No WireMock service: the brief has no external HTTP dependencies (requirements A-10).

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
    image: floci/floci:2.2.0
    ports: ["4566:4566", "7001-7099:7001-7099"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - floci-data:/app/data
    environment:
      FLOCI_HOSTNAME: floci
      FLOCI_STORAGE_MODE: persistent
      FLOCI_STORAGE_PERSISTENT_PATH: /app/data
      FLOCI_SERVICES_DOCKER_NETWORK: keyloop_default
      FLOCI_SERVICES_RDS_DEFAULT_POSTGRES_IMAGE: postgres:17-alpine   # floci defaults to 16; match Testcontainers
      FLOCI_SERVICES_UI_IMAGE: floci/floci-ui:0.6.0                   # web console at :4566/_floci/ui (default is :latest)
    healthcheck:                                # no curl/wget in the image; real probe in docker-compose.yml
      { test: ["CMD", "bash", "-c", "<GET /_floci/health over /dev/tcp, expect 200>"], interval: 5s, retries: 20 }

  otel-lgtm:
    image: grafana/otel-lgtm:0.36.0
    ports: ["3001:3000", "4317:4317", "4318:4318"]

  # ---------- full stack (profile: app) ----------
  terraform:                                    # used by `pnpm infra:*` (profile: tools); shares x-terraform with bootstrap
    profiles: ["tools"]
    image: hashicorp/terraform:1.16.5
    working_dir: /infra/envs/local
    entrypoint: ["sh", "/infra/scripts/terraform.sh"]   # up | plan | down
    volumes: ["./infra:/infra", "tf-state:/infra/envs/local/state", "tf-data:/tf-data"]
    environment: { <<: *aws-env, TF_DATA_DIR: /tf-data, TF_IN_AUTOMATION: "1" }
    depends_on: { floci: { condition: service_healthy } }

  bootstrap:                                    # same Terraform config, one-shot `up` in full-stack mode
    profiles: ["app"]
    command: ["up"]
    # ...rest identical to terraform (YAML anchor x-terraform)

  migrate:                                      # image CMD: pnpm db:migrate && pnpm db:seed
    profiles: ["app"]
    build: { context: ., target: tools }
    environment: { <<: *aws-env, DB_SECRET_ID: keyloop/docker/db }
    depends_on: { bootstrap: { condition: service_completed_successfully } }

  api:
    profiles: ["app"]
    build: { context: ., target: runtime }
    ports: ["3000:3000"]
    environment: { <<: *aws-env, PORT: "3000", DB_SECRET_ID: keyloop/docker/db, OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-lgtm:4318, OTEL_SERVICE_NAME: keyloop-api }
    depends_on: { migrate: { condition: service_completed_successfully }, otel-lgtm: { condition: service_started } }
    healthcheck: { test: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/health > /dev/null || exit 1"], interval: 5s, retries: 20 }

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
  tf-data:
```

## Dockerfile (multi-stage)
Base image `node:24.21.0-alpine3.24` (pinned). pnpm comes from corepack, using the version in `packageManager`.

| Stage | Contents | Used by |
|---|---|---|
| `deps` | `pnpm install --frozen-lockfile --ignore-scripts` (all deps) | `build` |
| `build` | `prisma generate` + `nest build` | `tools`, `runtime` |
| `tools` | full source + dev deps (Prisma CLI, tsx, scripts); CMD `pnpm db:migrate && pnpm db:seed`; user `node` | `migrate` |
| `prod-deps` | `pnpm install --prod --frozen-lockfile --ignore-scripts` | `runtime` |
| `runtime` | prod deps + `dist/`, non-root `node` user, `HEALTHCHECK` on `/health`, CMD `node dist/main` | `api` |

The runtime image contains no dev dependencies, scripts, sources or `.env` (`.dockerignore` also excludes `infra/`, `docs/`, `.git`).
Known size issue: it's about 560 MB, because pnpm installs `prisma` (CLI, Studio, TypeScript) as a resolved peer of
`@prisma/client` even with `--prod`. Trimming it is a possible follow-up.

### Podman
On Podman (for example Podman Desktop on Windows behind the Docker CLI), BuildKit builders may fail to start
(`crun: create /sys/fs/cgroup/docker: Permission denied`). Build with the classic API, which Podman serves through buildah:
`DOCKER_BUILDKIT=0 docker compose --profile app up --build`. Podman also drops `HEALTHCHECK` from OCI-format images,
which is why the `api` service repeats it in Compose.

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
