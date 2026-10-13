# M6 — Delivery

**Status:** `in-progress`
**Goal:** a reviewer can run, try and understand the solution in minutes.
**Requirements:** NFR-1, NFR-4

## Tasks
- [x] README: overview, one-command run, how to try it (Swagger + `test/http/*.http` built from the scenarios in `prisma/seed/README.md`), how to run tests
- [x] `docs/design-notes.md`: architecture summary, how availability and allocation work, how double-booking is prevented, key trade-offs, assumptions, what I'd do with more time
- [ ] Final pass on `requirements.md`: assumptions and open questions current; every Must/Should FR marked done or explicitly deferred
- [ ] Verify the full-stack Compose run on a clean machine (Windows + macOS/Linux if possible)

## Acceptance criteria
- Clean clone → README steps → demo requests behave as documented

## Notes
-
- Task 2: `docs/design-notes.md` now covers the architecture, the booking check order and allocation, availability, the three layers against double-booking (incl. the P2034 deadlock retry from M5), time zones, trade-offs, assumptions, testing, the M5 load check and a prioritised "more time" list. Every factual claim was checked against code and migrations.
