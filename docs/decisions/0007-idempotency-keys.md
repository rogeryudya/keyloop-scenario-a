# 0007 — Idempotent booking with `Idempotency-Key`

- **Status:** accepted
- **Date:** 2026-10-12

## Context
FR-11 (Could): a client that retries `POST /v1/appointments` after a timeout must not book twice. Same key + same body
must return the same response; same key + different body must be rejected (422). Retries can also arrive
**concurrently** (a client with a short timeout fires again while the first request is still running), so a
check-then-insert in application code alone isn't enough, the same problem ADR-0006 solves for double booking.

## Decision
**Store the key and a request hash on the appointment row, with a `UNIQUE` constraint on the key.**

- `appointments.idempotency_key` (`varchar(255)`, nullable, `UNIQUE`) and `appointments.request_hash` (`char(64)`,
  nullable), with a CHECK that both are set or neither. They're written by the same insert as the booking, so the
  key exists if and only if its appointment does.
- The entity carries them as an optional `idempotency: { key, requestHash }` set at creation. The domain doesn't
  interpret them; the handler computes the hash.
- The handler looks the key up **first** (`AppointmentRepository.findByIdempotencyKey`), before any other check.
  Same hash → return the stored id, so the controller sends the same `201` + `Location` (even if the start time has
  since passed, or the booking was cancelled). Different hash → `IDEMPOTENCY_KEY_REUSED` (422).
- Failed requests store nothing and can be retried with the same key.
- **Race:** two requests with the same key both miss the lookup and both try to insert. The loser hits the unique
  key (or the exclusion constraint, if it picked the same bay/technician), which the repository maps to
  `AppointmentConflictError`. The transaction rolls back and the existing M2 retry loop runs again. On the retry the
  lookup finds the winner and replays it. The concurrency integration test asserts that 10 parallel same-key
  requests all get the same single appointment.
- The request hash is sha256 over the parsed command (customer, vehicle, dealership, service type, start as a UTC
  instant), so `10:00+07:00` and `03:00Z` count as the same request.
- The header is optional and validated at the boundary (1–255 visible ASCII). Keys are global and never expire (A-16).

## Alternatives considered
- **Separate `idempotency_keys` table** (key PK, hash, FK to the appointment). This was built first. It keeps the
  entity free of the two fields and makes expiry a plain `DELETE`, but adds a table, a port, an adapter and a fake for
  the same guarantee. Since there is exactly one key per appointment and no expiry requirement, columns are simpler.
  Revisit if keys must expire or must cover other endpoints.
- **`UNIQUE` on the request hash alone** (no key). Natural deduplication, but it would forbid legitimately booking the
  same car, service and time again (e.g. after a cancellation), and can't tell a retry from a deliberate repeat.
- Caching the whole HTTP response in an interceptor. More general, but it needs a "pending" state and locking for
  concurrent duplicates. The only success response is `{ id }` + `Location`, which can be rebuilt from the id.
- An in-memory or Redis store. Not transactional with the booking, and it adds a dependency.

## Consequences
- Replays are cheap and don't depend on current availability or the clock.
- Two mostly-`NULL` columns on `appointments`; the unique index ignores `NULL`s, so bookings without a key are unaffected.
- A key that lost a race may consume one of the 3 retries. Under pathological contention the client gets
  `409 APPOINTMENT_CONFLICT` and can safely retry with the same key.
- Expiring keys later means `UPDATE … SET idempotency_key = NULL, request_hash = NULL`, or moving to a table.
- If authentication is added, keys should be scoped per client (e.g. unique on `(client_id, idempotency_key)`).
