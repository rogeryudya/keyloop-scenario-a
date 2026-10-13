# M6 — Delivery

**Status:** `done`
**Goal:** a reviewer can run, try and understand the solution in minutes.
**Requirements:** NFR-1, NFR-4

## Tasks
- [x] README: overview, one-command run, how to try it (Swagger + `test/http/*.http` built from the scenarios in `prisma/seed/README.md`), how to run tests
- [x] `docs/design-notes.md`: architecture summary, how availability and allocation work, how double-booking is prevented, key trade-offs, assumptions, what I'd do with more time
- [x] Final pass on `requirements.md`: assumptions and open questions current; every Must/Should FR marked done or explicitly deferred
- [x] Verify the full-stack Compose run on a clean machine (Windows + macOS/Linux if possible)

## Acceptance criteria
- Clean clone → README steps → demo requests behave as documented

## Notes
-
- Task 2: `docs/design-notes.md` now covers the architecture, the booking check order and allocation, availability, the three layers against double-booking (incl. the P2034 deadlock retry from M5), time zones, trade-offs, assumptions, testing, the M5 load check and a prioritised "more time" list. Every factual claim was checked against code and migrations.
- Task 3: `requirements.md` has a Status column for every FR and NFR. All FR-1–FR-11 are done with tests; none is deferred. NFR-5 is done locally, with the Datadog trial-key check still open (M5). Assumptions A-1–A-16 were reviewed and are unchanged; later M4/M5 choices are operational and live in ADRs and docs. Q-1–Q-6 are still open.
- Task 4, clean-machine check (2026-10-13):
  - **Windows 11 + Podman 5.8.5:** a fresh `git clone` with all Compose volumes removed first (the project name is pinned to `keyloop`, so a clone shares volumes with an existing checkout). Following the README, `up --build` was healthy in 147 s, and `/health`, `/docs`, Grafana and the floci console all returned 200. Every request in the three `.http` files matched its documented result, and `parallel-booking.sh` gave 1 × 201 + 9 × 409. The README's Tempo query found the 12 rejected bookings, and Prometheus counted rejections by reason exactly as the scenarios predict. Base images and build layers were cached, so a first-ever run also downloads images.
  - **Linux:** the CI `smoke` job runs the same command on a fresh Ubuntu runner with no cache, on every PR. It was green on PR #6 (run 38385475698).
  - **Not verified:** macOS (no machine available) and Docker Desktop on Windows (Podman was used).
