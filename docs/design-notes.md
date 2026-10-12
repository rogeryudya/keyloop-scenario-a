# Design notes

> The full design notes (architecture summary, availability and allocation, double-booking prevention,
> trade-offs, assumptions, next steps) come with M6. This file starts with the M5 load check.

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
- **Latency is queueing, not work.** One booking on its own takes about 85–95 ms here (`pnpm load:booking 1`, three runs). With 200 arriving
  at once, each booking runs its checks and insert in a transaction, so requests wait for a DB connection
  and for the rows locked by competing transactions. p50 ≈ 1.4–1.8 s is the cost of serialising 200
  writes on one dealership's resources, on a laptop.
- **Where to look for more throughput (not needed for the brief):** the Prisma/pg pool size, horizontal
  API replicas (the DB constraint keeps correctness across instances), and splitting the hot-path reads.
  Traces in Tempo for the run show the time per SQL statement.
