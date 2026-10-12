# 0007 — Idempotent booking with `Idempotency-Key`

- **Status:** accepted
- **Date:** 2026-10-12

## Context
FR-11 (Could): a client that retries `POST /v1/appointments` after a timeout must not book twice. Same key + same body
must return the same response; same key + different body must be rejected (422). Retries can also arrive
**concurrently** (a client with a short timeout fires again while the first request is still running), so a
check-then-insert in application code alone isn't enough, the same problem ADR-0006 solves for double booking.

## Decision
**A separate `idempotency_keys` table, written in the booking transaction, with the key as primary key.**

- The handler looks the key up **first**, before any other check. A known key with the same request hash returns
  the stored appointment id, so the controller sends the same `201` + `Location`. A different hash →
  `IDEMPOTENCY_KEY_REUSED` (422).
- On a successful booking the key row is inserted in the same transaction as the appointment, so either both exist
  or neither does. Failed requests store nothing and can be retried with the same key.
- **Race:** two requests with the same key both miss the lookup and both try to book. The loser's key insert hits
  the PK (or its appointment insert hits the exclusion constraint first). Either way it surfaces as
  `AppointmentConflictError`, the transaction rolls back, and the existing M2 retry loop runs again. On the retry the
  lookup finds the winner's key and replays it. The concurrency integration test asserts that 10 parallel same-key
  requests all get the same single appointment.
- The request hash is sha256 over the parsed command (customer, vehicle, dealership, service type, start as a UTC
  instant), so `10:00+07:00` and `03:00Z` count as the same request.
- The header is optional and validated at the boundary (1–255 visible ASCII). Keys are global and never expire (A-16).

## Alternatives considered
- Columns on `appointments` (`idempotency_key UNIQUE`). Mixes transport concerns into the aggregate, and a key
  can't outlive or describe anything other than an appointment. Rejected, as planned in the data dictionary.
- Caching the whole HTTP response (status, headers, body) in an interceptor. More general, but needs a "pending"
  state and locking to handle concurrent duplicates, and it stores HTTP details in the DB. The only success
  response is `{ id }` + `Location`, which can be rebuilt from the appointment id.
- An in-memory or Redis store. Not transactional with the booking (a crash between the two writes breaks the
  guarantee) and adds a dependency.
- `SELECT … FOR UPDATE` / advisory lock on the key. Also works, but the PK + existing retry gives the same result with
  no new mechanism.

## Consequences
- Replays are cheap and don't depend on current availability or the clock.
- A key that lost a race may consume one of the 3 retries. In the worst case (pathological contention) the client gets
  `409 APPOINTMENT_CONFLICT` and can safely retry with the same key.
- Keys accumulate. Deferred: an expiry (e.g. 24 h) plus cleanup job, if the table ever matters.
- If authentication is added later, keys should be scoped per client (composite PK), or one client could probe another's keys.
