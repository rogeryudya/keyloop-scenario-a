# Keyloop Service Scheduler

Backend for **Scenario A: The Unified Service Scheduler**. A customer asks for a service appointment for a
vehicle, a service type and a dealership at a chosen time. Before confirming, the API checks that a service
bay **and** a technician qualified for that service are both free for the whole duration, picks them, and
stores a confirmed appointment that links customer, vehicle, technician and bay.

- **Correct under concurrency:** two requests can never book the same bay or technician for overlapping
  times. A Postgres exclusion constraint enforces it, and a bounded retry handles lost races
  ([ADR-0006](docs/decisions/0006-data-model-double-booking.md)).
- **Clear rejections:** each failure has its own code, such as `NO_SERVICE_BAY_AVAILABLE`,
  `NO_TECHNICIAN_AVAILABLE` or `OUTSIDE_OPENING_HOURS` ([API](docs/api.md)).
- **Beyond the brief, kept small:** an availability query, cancellation, listing with cursor pagination,
  and an `Idempotency-Key` for safe retries.
- **Runs like AWS, locally:** Postgres on RDS and credentials in Secrets Manager, emulated by
  [floci](https://floci.io) and provisioned with Terraform. Traces, logs and metrics go through
  OpenTelemetry to Grafana.

Stack: Node 24, TypeScript, NestJS (Clean Architecture + CQRS), PostgreSQL 17 + Prisma, Jest + Testcontainers,
Terraform, Docker Compose. Design overview: [docs/design-notes.md](docs/design-notes.md).

## Run it
Only Docker is needed (Docker Desktop, or Docker Engine with Compose v2).

```bash
docker compose --profile app up --build
```

This starts the AWS emulation, creates the database and its secret with Terraform, runs migrations and seed
data, then starts the API. The first run takes a few minutes: image builds plus about 1.5 minutes of RDS
provisioning. Later runs are faster.

| Open | URL |
|---|---|
| API docs (Swagger) | http://localhost:3000/docs |
| Health | http://localhost:3000/health |
| Grafana: traces, logs, metrics | http://localhost:3001 |
| AWS console (floci): RDS and secrets | http://localhost:4566/_floci/ui |

Stop with `Ctrl+C`; remove everything, data included, with `docker compose --profile app down -v`.

<details><summary>Podman, or the stack doesn't start</summary>

- **Podman:** run `DOCKER_BUILDKIT=0 docker compose --profile app up --build`.
- **Docker socket:** floci starts the Postgres container through it, so it must be available to containers
  (the default in Docker Desktop).
- **Ports in use:** the stack needs 3000, 3001, 4317, 4318, 4566 and 7001.
- More: [docs/local-dev/](docs/local-dev/README.md).
</details>

## Try it
The seed data has 6 dealerships in Thailand and Vietnam with their bays and technicians, 10 service types,
16 customers with 22 vehicles, and 24 demo appointments placed **tomorrow and the next days**: 3 drive the
scenarios below, and the rest fill the calendars of Chiang Mai, Da Nang and Phuket
([prisma/seed/README.md](prisma/seed/README.md)). Times are local to the dealership, UTC+7.

**In Swagger:** open http://localhost:3000/docs, try `POST /v1/appointments` with its example body, and change
the date to tomorrow.

**With the demo request files:** [test/http/](test/http/) has ready-made requests for the VS Code
[REST Client](https://marketplace.visualstudio.com/items?itemName=humao.rest-client) extension (recommended
when you open the repo). They fill in tomorrow's date themselves.

| File | What it shows |
|---|---|
| [booking-scenarios.http](test/http/booking-scenarios.http) | One request per business rule, each with its expected result |
| [appointment-lifecycle.http](test/http/appointment-lifecycle.http) | Book, idempotent replay, read, list, cancel, rebook the freed slot |
| [reference-data.http](test/http/reference-data.http) | Dealerships, service types, availability |
| [parallel-booking.sh](test/http/parallel-booking.sh) | 10 identical bookings at once for a one-bay slot |

What the booking scenarios show:

| # | Request (tomorrow) | Result | Rule |
|---|---|---|---|
| 1 | Somsak, oil change, Bangkok 11:00 | `201`, a bay and a qualified technician assigned | FR-1–3 |
| 2 | Tuan, oil change, Hanoi 10:00 | `409 NO_SERVICE_BAY_AVAILABLE`: the only bay is taken | BR-7 |
| 3 | Same at 10:30 | `201`: back-to-back is allowed | BR-2 |
| 4 | Prasit, transmission repair, Bangkok 09:30 | `409 NO_TECHNICIAN_AVAILABLE`: bays free, the one qualified technician busy | BR-8 |
| 5 | Same at 10:30 | `201` with that technician | BR-8 |
| 6 | EV battery check at Hanoi | `422 SERVICE_TYPE_NOT_SUPPORTED` | BR-6 |
| 7 | Malee with Somsak's car | `422 VEHICLE_NOT_OWNED_BY_CUSTOMER` | BR-5 |
| 8 | 120-min service at 15:30, closes 17:00 | `422 OUTSIDE_OPENING_HOURS` | BR-4 |
| 9 | Hanoi 14:00, where a *cancelled* appointment sits | `201` | BR-9 |
| 10 | 10 parallel requests for one Hanoi slot (`bash test/http/parallel-booking.sh`) | exactly one `201`, the rest `409` | FR-5, BR-10 |
| 11 | A start time in the past | `422 APPOINTMENT_IN_PAST` | BR-3 |

Successful scenario bookings carry an `Idempotency-Key`, so running the file again replays them instead of
booking twice. If the stack runs past midnight in Bangkok, re-seed to move the demo appointments to the new
"tomorrow": `docker compose --profile app run --rm migrate`. For a completely fresh start, use
`docker compose --profile app down -v`, then `up` again.

### See it in Grafana
Every response has an `x-request-id` header. In Grafana (http://localhost:3001) → **Explore**:

- **Tempo:** `{span.outcome="conflict"}` lists rejected bookings. A trace shows the request, the use case with its
  outcome and error code, and every SQL statement.
- **Loki:** `{service_name="keyloop-api"} | request_id="<id>"` finds a request's log line, with its `trace_id`.
- **Prometheus:** `appointments_created_total`, `appointment_rejections_total` by `reason`, request latency.

More queries: [docs/local-dev/observability.md](docs/local-dev/observability.md).

## Run the tests
Needs Node 24 and pnpm (`corepack enable`). Integration and e2e tests start their own Postgres with
Testcontainers, so Docker must be running; they don't need the Compose stack.

```bash
pnpm install
pnpm test          # unit: business rules, handlers (no Docker)
pnpm test:int      # integration: real Postgres + floci, incl. parallel booking races
pnpm test:e2e      # the HTTP API against the real app
pnpm test:all      # lint → typecheck → unit → integration → e2e
pnpm load:booking  # 200 concurrent bookings against a running stack; checks nothing is double-booked
```

CI runs the same checks plus a full-stack smoke test on every pull request ([docs/ci.md](docs/ci.md)). Domain
and application code must keep at least 90% coverage per folder.

## Optional: run it on ECS
The same API can run the way it would in AWS: an image in ECR, an ECS Fargate service behind a load balancer, all
created by Terraform against floci. It needs Node and pnpm for the script, plus Docker; the stack from "Run it" can
be running or not. On Podman, prefix `DOCKER_BUILDKIT=0`.

```bash
pnpm install
pnpm infra:ecs        # about 5 minutes the first time → http://localhost:8080/docs
pnpm infra:ecs:down   # remove it again
```

What this does and doesn't prove: [design-notes.md › Running on ECS](docs/design-notes.md#running-on-ecs-m7).
floci's web console doesn't show ECS, ECR or load balancers yet; the script prints what it created.

## Develop
To run the API on your machine with hot reload, against the same floci and Grafana containers:

```bash
pnpm install
cp .env.example .env      # local config; no real secrets
docker compose up -d      # floci, otel-lgtm
pnpm infra:up             # Terraform in Docker → RDS + DB secrets (idempotent)
pnpm db:migrate && pnpm db:seed
pnpm start:dev            # http://localhost:3000/docs
```

Project rules for contributors and AI assistants: [CLAUDE.md](CLAUDE.md).

## Docs
| Topic | Where |
|---|---|
| Design overview: architecture, allocation, double-booking, trade-offs | [docs/design-notes.md](docs/design-notes.md) |
| Requirements, business rules, assumptions, open questions | [docs/requirements.md](docs/requirements.md) |
| API reference and error codes | [docs/api.md](docs/api.md) (Swagger at `/docs`) |
| Architecture and layer rules | [docs/architecture/](docs/architecture/README.md) |
| Decisions (ADRs) | [docs/decisions/](docs/decisions/) |
| Data model | [docs/data-dictionary.md](docs/data-dictionary.md) |
| Local environment, AWS emulation, observability | [docs/local-dev/](docs/local-dev/README.md) |
| Testing strategy | [docs/testing/](docs/testing/README.md) |
| CI and infrastructure | [docs/ci.md](docs/ci.md), [docs/infrastructure.md](docs/infrastructure.md) |
| Progress by milestone | [docs/milestones/](docs/milestones/README.md) |
