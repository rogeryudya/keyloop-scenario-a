# Design notes

How the service scheduler works and why it's built this way. The brief, business rules (BR-n) and assumptions
(A-n) are in [requirements.md](requirements.md); each larger decision has an ADR in [decisions/](decisions/).

## In short
A booking request names a customer, vehicle, dealership, service type and start time. The API checks the
request against the business rules, picks a free bay and a free qualified technician for the whole service
duration, and stores a confirmed appointment, all in one database transaction. A Postgres exclusion
constraint makes double-booking impossible even when requests race, and the handler retries a booking that
loses a race. Every rejection has a specific code.

## Architecture
A modular monolith in NestJS: `dealerships` (reference data), `customers` and `appointments` (booking,
availability, lifecycle). Each module has four layers, and dependencies only point inward. ESLint enforces
the layer rules, so a violation fails CI ([ADR-0002](decisions/0002-clean-architecture-cqrs.md),
[ADR-0005](decisions/0005-layer-boundary-lint.md)).

```
HTTP ─▶ presentation   controller: validate DTO → Command/Query → CommandBus/QueryBus
          │                         maps the result to a response DTO; errors → standard error JSON
          ▼
        application    one handler per use case; owns the transaction (@Transactional)
          │            ports: AppointmentRepository, BookableResources, BookingMetrics, Clock …
          ▼
        domain         Appointment, TimeSlot, OpeningHours, ResourceAllocator, Availability
                       pure TypeScript: no Nest, no Prisma; every rule unit-tested
        infrastructure Prisma repositories and read models, OpenTelemetry adapters (implement the ports)
```

- **Why CQRS with a mediator:** controllers know only message classes, never which handler runs or that
  Prisma exists. Writes go through the domain; simple reads go straight from a query handler to a read port.
- **Cross-cutting concerns stay out of handlers:** validation in a global pipe, errors in one exception filter,
  transactions in a decorator, and tracing as a wrapper around the command and query buses
  ([ADR-0008](decisions/0008-handler-tracing-bus-wrapper.md)).
- **The cost:** more files per feature (command, handler, DTOs, mapper). One folder per use case keeps it
  navigable.

## Booking an appointment
`POST /v1/appointments` → `CreateAppointmentHandler`. Inside one transaction, it checks in this order and
reports the first failure (A-13):

| Step | Rule | Failure |
|---|---|---|
| 1 | Request shape, ISO-8601 with offset, UUIDs, no unknown fields | `400 VALIDATION_FAILED` |
| 2 | A known `Idempotency-Key` is answered first: replay the original booking | `422 IDEMPOTENCY_KEY_REUSED` if the body differs |
| 3 | Dealership, service type, customer and vehicle exist | `404 …_NOT_FOUND` (BR-13) |
| 4 | The vehicle belongs to the customer | `422 VEHICLE_NOT_OWNED_BY_CUSTOMER` (BR-5) |
| 5 | End = start + the service type's duration; start is in the future | `422 APPOINTMENT_IN_PAST` (BR-1, BR-3) |
| 6 | The whole interval fits the opening hours, in the dealership's time zone | `422 OUTSIDE_OPENING_HOURS` (BR-4) |
| 7 | Some technician at the dealership is qualified for the service | `422 SERVICE_TYPE_NOT_SUPPORTED` (BR-6) |
| 8 | A bay is free for the whole interval | `409 NO_SERVICE_BAY_AVAILABLE` (BR-7) |
| 9 | A qualified technician is free for the whole interval | `409 NO_TECHNICIAN_AVAILABLE` (BR-8) |
| 10 | Insert the appointment; the database constraint has the final say | retried, see below |

**Allocation (BR-11).** The client doesn't choose resources (A-4). `ResourceAllocator` is a pure function. It
receives the candidate bays and qualified technicians and the confirmed bookings that overlap the slot. It
picks the lowest-id free bay and the free qualified technician with the fewest appointments that day (ties go
to the lowest id), which spreads work across technicians. The choice is deterministic, which makes it easy to
test and to explain.

**Intervals are half-open** `[start, end)` (BR-2), so a booking ending at 10:30 doesn't clash with one starting
at 10:30. Only `CONFIRMED` appointments block resources; cancelling frees them at once (BR-9).

## Availability
`GET /v1/dealerships/:id/availability?serviceTypeId&date` (FR-7) walks the opening window of that local date
in 15-minute steps counted from opening time (A-9, A-14). It keeps each start that:
- is in the future (BR-3);
- fits the opening hours (BR-4);
- `ResourceAllocator` can staff (BR-6–9).

It reuses the same allocator as booking, so availability and booking can't disagree: any slot it returns can
be booked, unless someone takes it first. The day's bookings are loaded once and the walk runs in memory.

## Preventing double-booking
"Check, then confirm" has a race: two requests can both see bay 1 free and both insert. The design has three
layers ([ADR-0006](decisions/0006-data-model-double-booking.md)):

1. **Domain check in the transaction.** In the normal case the allocator finds free resources, or returns the
   specific reason they're busy. This is what produces the helpful 409 codes.
2. **Exclusion constraints in Postgres, the real guarantee.** Two constraints, one per resource:
   ```sql
   EXCLUDE USING gist (service_bay_id WITH =, tstzrange(start_at, end_at, '[)') WITH &&)
     WHERE (status = 'CONFIRMED')
   ```
   (and the same for `technician_id`). No writer can create overlapping confirmed bookings: not a race, not a
   future endpoint, not a manual SQL script. `'[)'` makes the range half-open; the `WHERE` lets cancelled rows
   not block.
3. **Bounded retry.** A request that loses a race gets `AppointmentConflictError` from the repository. The
   handler then retries in a fresh transaction, up to 3 times, because another bay or technician may still
   be free. Three database errors count as a lost race:
   - `23P01`: the exclusion constraint;
   - `P2002`: the same `Idempotency-Key` committed first;
   - `P2034`: a deadlock between two concurrent inserts on the same resource. This one was found by a flaky
     CI run in M5.

   If every attempt loses, the client gets `409 APPOINTMENT_CONFLICT`, which is safe to retry.

Composite foreign keys also keep the bay and technician at the same dealership, the technician qualified,
and the vehicle owned by the customer, so even the reference integrity can't be broken by a bad write.

**Idempotency** ([ADR-0007](decisions/0007-idempotency-keys.md)): the optional `Idempotency-Key` and a hash of
the request are stored on the appointment row, with a `UNIQUE` key. Same key and body → the original `201`;
different body → `422`. Concurrent duplicates race on the unique key, and the loser's retry replays the
winner.

**Proof:**
- Integration tests run 10 parallel bookings against real Postgres and assert exactly one or two winners and
  a single same-key appointment.
- The load check below fires 200 at once and verifies nothing overlaps.

## Time and time zones
- **Storage is UTC.** The API takes ISO-8601 with an offset (A-7) and stores `timestamptz`.
- **Opening hours are local.** They're a daily window in the dealership's IANA time zone (A-6), and BR-4 is
  checked in that zone.
- **Seed data:** both countries are UTC+7 with no daylight saving.
- **DST is still handled.** Unit tests use a zone with a DST change, so the logic would hold anywhere.

## Key trade-offs
| Choice | Why | Cost |
|---|---|---|
| Exclusion constraint as the guard, not row locks or SERIALIZABLE | Protects every writer; bookings on different resources never wait for each other; the failure says which resource clashed | Postgres-specific (`btree_gist`), raw SQL in a migration Prisma can't express |
| Deterministic allocation (lowest id, least-loaded technician) | Simple, testable, explainable | Doesn't optimise the whole day: a 09:15 booking can block both 09:00 and 09:30 (seen in the load check) |
| Auto-assign bay and technician (A-4) | The brief asks to check availability, not to let customers pick | No customer preference for a technician (Q-2) |
| Check and insert in one transaction, no "hold" state (A-8) | "Before confirming, check" maps to an atomic check-and-confirm | No reserve-then-pay flow |
| Clean Architecture + CQRS | Business rules independent of HTTP and Prisma; every rule unit-testable | More files and ceremony than a controller → service → ORM design |
| Idempotency columns on the appointment, not a separate table | One key per booking, written by the same insert | Keys never expire; a separate table would be needed for expiry or other endpoints |
| AWS emulation locally (floci, Terraform, Secrets Manager) | The same shape as a cloud deployment, with no AWS account | A heavier local stack and a longer first start than a plain Postgres container |

## Assumptions
The brief is short, so these were decided and recorded rather than guessed silently. All are in
[requirements.md › Assumptions](requirements.md#6-assumptions).

- **Scope:**
  - No authentication; the request carries `customerId` (A-1).
  - Reference data is seeded, with no admin API (A-2).
- **Services and resources:**
  - One service type per appointment, with a fixed duration (A-3).
  - Any bay can host any service (A-5).
  - Technicians work all opening hours, which are one window every day (A-6, A-11).
- **Availability:** a 15-minute grid from opening time, on a local calendar date (A-9, A-14).
- **Rule precedence:** when both a bay and a technician are missing, the bay error is reported (A-13).
- **Idempotency:** keys are global and never expire (A-16).

The open questions for the interviewer are there too (Q-1–Q-6): technician preference, bay capabilities,
shifts and breaks, rescheduling, and suggesting alternatives on a 409.

## Testing approach
- **Unit:** every business rule and handler branch, with fakes for the ports.
  - Domain and application code is gated at 90% coverage per folder in CI; actual coverage is about 95–100%.
- **Integration:** Testcontainers Postgres and floci. Covers repositories, the exclusion constraints, the
  transaction and retry behaviour, parallel booking races, and loading DB credentials from Secrets Manager.
- **End-to-end:** the real HTTP API with Supertest. Covers the error format, validation, versioning and
  `x-request-id`.
- **CI:** all of the above plus a full Docker stack smoke test on every pull request
  ([ci.md](ci.md)).
- **Demo requests:** `test/http/` contains every seed scenario; README › Try it.

## Load check (M5)
`pnpm load:booking [requests]` (script: [scripts/load/booking-load.ts](../scripts/load/booking-load.ts)) fires
`requests` (default 200) `POST /v1/appointments` at once against a running API. All of them are OIL_CHANGE
(30 min) at Bangkok on a random far-future day, spread over 8 start times 15 minutes apart (09:00–10:45
local), so neighbouring slots overlap and every request competes for the same 3 bays and 2 qualified
technicians. It then lists the day's appointments and checks:
- no 5xx or network errors;
- every `201` matches a stored `CONFIRMED` appointment;
- no two `CONFIRMED` appointments overlap on the same bay or technician (BR-10).

It exits with code 1 if any check fails.

### Results (2026-10-13)
Environment: full Compose stack (`--profile app`) on Podman 5.8.5 / Windows 11, 12 CPUs; one API container,
Postgres 17 via floci, client on the same machine. 200 requests per run, all fired at once.

| Run | 201 | 409 `NO_TECHNICIAN_AVAILABLE` | 5xx | p50 | p95 | p99 | max | Wall time |
|---|---|---|---|---|---|---|---|---|
| 1 | 8 | 192 | 0 | 1751 ms | 2612 ms | 2655 ms | 2660 ms | 2.7 s (74 req/s) |
| 2 | 8 | 192 | 0 | 1603 ms | 2390 ms | 2430 ms | 2439 ms | 2.5 s (80 req/s) |
| 3 | 7 | 193 | 0 | 1359 ms | 1864 ms | 1920 ms | 1923 ms | 2.0 s (100 req/s) |

All checks passed in every run: no double-booking, and every 201 was stored. Across the three runs, 13
attempts lost a race on the exclusion constraint and were retried (`appointment_conflict_retries_total`);
none ran out of retries (no `APPOINTMENT_CONFLICT`).

What this shows:
- **Correctness under contention holds.** The ceiling is 8 bookings: two qualified technicians, each fitting
  4 non-overlapping 30-minute slots between 09:00 and 11:15. Runs hit 8 or 7, never more. 7 is a
  first-come effect, not a bug: an early 09:15 booking blocks both 09:00 and 09:30 for that technician.
  Allocation is per request (BR-11) and doesn't re-pack the day.
- **Latency is queueing, not work.** One booking on its own takes about 85–95 ms here
  (`pnpm load:booking 1`, three runs). With 200 arriving at once, each booking runs its checks and insert in
  a transaction, so requests wait for a DB connection and for the rows locked by competing transactions.
  p50 ≈ 1.4–1.8 s is the cost of serialising 200 writes on one dealership's resources, on a laptop.
- **Where to look for more throughput (not needed for the brief):** the Prisma/pg pool size, horizontal
  API replicas (the DB constraint keeps correctness across instances), and splitting the hot-path reads.
  Traces in Tempo for the run show the time per SQL statement.

## Running on ECS (M7)
`pnpm infra:ecs` deploys the API the way it would run in AWS, on [floci](https://floci.io). Terraform creates:
- ECR, and the image goes there;
- a VPC with public and private subnets and chained security groups;
- an ECS Fargate service in the private subnets, behind an ALB;
- least-privilege IAM roles and a CloudWatch log group.

`envs/aws-dev` wires the same modules for real AWS, with a NAT gateway and no floci settings. It is never applied
here, but it validates and plans cleanly. How it runs: [infrastructure.md](infrastructure.md) › M7.

**What the floci run proves:**
- **The image is production-ready.** The `runtime` image starts with nothing but its environment, reads its DB
  credentials from Secrets Manager by ARN, connects to RDS, and passes the same health check in ECS as in Compose.
- **The Terraform is real.** The AWS provider created all 34 resources against floci's APIs, and a re-plan showed no
  changes. It surfaced two provider details a plain `validate` would not:
  - security group references read back account-qualified unless the provider knows its account id;
  - the ALB waiter takes about a minute.
- **The wiring works end to end.** A booking through the ALB reached a task in a private subnet, which wrote to RDS.
  Its logs reached CloudWatch Logs, and its traces reached Grafana.
- **Deploys roll.** Each run pushes a uniquely tagged image and creates a new task definition revision, and ECS
  replaces the running task. The deployment circuit breaker is configured, so failures roll back on AWS.

**What floci can't prove**, and what to check on real AWS before relying on it:

| Area | On floci | On AWS |
|---|---|---|
| IAM | Roles and policies are created but **not enforced**. The local task even uses dummy keys | The task role must really be allowed to read only its secret; test that a second secret is denied |
| Networking | Tasks join the Compose network; security group rules and route tables aren't enforced (not tested). ECS reports an emulated VPC IP, not the container's | Private subnets, the NAT route, and SG chaining internet → ALB → tasks → RDS decide what's reachable |
| Image pull | floci starts tasks through the local engine, from the locally tagged image; nothing is pulled from ECR | Tasks pull from ECR through the NAT gateway (or VPC endpoints), using the execution role |
| Load balancing | Real HTTP forwarding, but target health stays `unhealthy` while serving, and the listener can't use port 80 | Health checks gate traffic; port 80 (and 443 with an ACM certificate) |
| Deployments | The old task stops before the new one is healthy: about 10 s of 503 per redeploy | Rolling deploy keeps 100% healthy capacity; the circuit breaker rolls back failures |
| Scaling and resilience | One task, one machine | Tasks spread over two AZs; auto scaling isn't configured yet |

In short: floci shows that the artifacts and the infrastructure code are correct and fit together. It can't show
that the security boundaries hold, or how the service behaves under failure or load.

## What I'd do with more time
Roughly in priority order; none of these is needed for the brief.

1. **Authentication**, then scope idempotency keys and appointment access to the caller (A-1, ADR-0007).
2. **Technician shifts, breaks and holidays** (Q-4). Availability would intersect working hours with opening
   hours. The allocator already takes its candidates as input, so this would mostly be a data and query
   change.
3. **Suggest alternatives on a 409** (Q-6). The availability query already answers "what's free that day";
   the 409 body could include the nearest free starts.
4. **Rescheduling** as one atomic operation (cancel and book in one transaction, Q-5), so a customer can't
   lose their slot halfway.
5. **Smarter allocation.** Prefer the resource that leaves the fewest unusable gaps, so the day packs
   better. The load check shows 7 of a possible 8 bookings in one run.
6. **Events for side effects.** Publish `AppointmentConfirmed` / `AppointmentCancelled` through an outbox
   table for notifications or a CRM, without coupling the booking transaction to them.
7. **Operational polish:**
   - name HTTP spans by route;
   - add dashboards and alerts on rejection rate and conflict retries.
8. **Real AWS deployment** of `envs/aws-dev`:
   - a CD pipeline that pushes the image and applies with its git sha;
   - HTTPS with an ACM certificate;
   - auto scaling on CPU or request count;
   - VPC endpoints instead of the NAT gateway to cut cost;
   - checks for the gaps in the table above.
