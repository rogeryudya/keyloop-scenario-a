# M1 — Domain model and reference data

**Status:** `in-progress`
**Goal:** the scheduling domain modelled in code and in Postgres, with realistic seed data and read endpoints for reference data.
**Requirements:** FR-10, BR-1, BR-2, BR-4 (value objects), NFR-6 (DB constraints)

## Tasks
- [x] Value object `TimeSlot` (`shared/domain`): half-open `[start, end)`, `overlaps()`, `fromStartAndDuration()`, rejects end ≤ start. Unit tests incl. back-to-back, enclosing, partial, identical intervals
- [x] Value object `OpeningHours`: daily open/close in a time zone, `contains(slot)`. Unit tests incl. a slot ending exactly at closing time and a DST day in a DST zone (e.g. `Europe/London`); the seed zones, Bangkok and Vietnam, have no DST, but the code must not assume that
- [ ] Entity `Appointment` (`create` / `restore` / `cancel`), status `CONFIRMED | CANCELLED`, invariants per BR-1, BR-3, BR-12. Unit tests
- [ ] Prisma schema exactly per `docs/data-dictionary.md` (tables, types, checks, composite FKs, indexes)
- [ ] Migration raw SQL for what Prisma can't express: `btree_gist` + the two **exclusion constraints**, partial index, `lower(email)` unique index, check constraints (see `docs/data-dictionary.md`)
- [ ] ADR 0005: data model and how double-booking is prevented (exclusion constraint vs locking vs serializable)
- [ ] Seed script `pnpm db:seed` loading `prisma/seed/data.json` per the rules in `prisma/seed/README.md` (idempotent, demo appointments relative to "tomorrow" in dealership time zone, validated before insert)
- [ ] `dealerships` module: queries + endpoints `GET /v1/dealerships`, `GET /v1/dealerships/:id`, `GET /v1/service-types` (FR-10), cursor pagination on lists
- [ ] Integration tests: exclusion constraint rejects an overlapping insert for the same bay / technician, accepts back-to-back and cancelled overlaps
- [ ] `docs/api.md` updated

## Acceptance criteria
- `pnpm db:migrate && pnpm db:seed` run clean twice in a row
- Inserting overlapping `CONFIRMED` rows for one bay or technician fails **at the DB level**
- Names in code and tables match the glossary in `requirements.md`

## Notes
- Prisma can't express exclusion constraints or range types; keep them in the SQL migration and document that the Prisma schema isn't the whole truth.
