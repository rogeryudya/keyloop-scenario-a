# M3 — Availability query and appointment lifecycle

**Status:** `in-progress`
**Goal:** clients can see when a service can be booked, cancel appointments, and list them.
**Requirements:** FR-7, FR-8, FR-9, FR-11, BR-9, BR-12

## Tasks
- [x] FR-7 `GetAvailabilityQuery`: for dealership + service type + date, return start times on a 15-minute grid within opening hours, not in the past, where `ResourceAllocator` would succeed. Load the day's appointments once and compute in memory (no query per slot)
- [x] `GET /v1/dealerships/:id/availability?serviceTypeId=&date=` → `{ data: [{ start, end }] }` in the dealership's time zone offset
- [x] Unit tests: fully free day, fully booked day, slots blocked only by technician qualification, last slot that just fits before closing, today with past slots removed
- [x] FR-8 `CancelAppointmentCommand`: `Appointment.cancel(now)` (BR-12); `POST /v1/appointments/:id/cancel` → 200 with the updated appointment; cancelled slot becomes bookable again (integration test)
- [ ] FR-9 `ListAppointmentsQuery`: filter by `dealershipId` or `customerId` (+ optional date range), cursor pagination; `GET /v1/appointments`
- [ ] FR-11 (Could) `Idempotency-Key` header on `POST /v1/appointments`: same key + same body → same response, no second appointment; same key + different body → 422
- [ ] e2e tests for each endpoint; `docs/api.md` updated

## Acceptance criteria
- A slot returned by the availability endpoint can be booked immediately (e2e)
- Cancelling frees the slot: availability shows it again and booking it succeeds
- List endpoints follow the cursor pagination convention

## Notes
- If time is short, FR-9 and FR-11 can be dropped; record that in the design notes.
- FR-7: slots are computed by the pure domain service `Availability.slotsOn`, which reuses `ResourceAllocator` per grid point so availability and booking can't disagree. The handler loads the day's bookings once via the existing `findConfirmedOverlapping(dealershipId, openingWindow)`; no new repository method. `OpeningHours.windowOn(date)` converts a local date to UTC instants (DST-safe). Decisions: A-14.
- Availability endpoint: times rendered with `toZonedIso` (`shared/presentation/time`), the zone's offset at each instant, so DST days are right. Its e2e tests (incl. the "returned slot can be booked" acceptance check) are in `test/e2e/availability.e2e-spec.ts`.
- The milestone's unit-test list (free day, fully booked, qualification-only block, last slot before closing, today minus past slots) is covered in `availability.spec.ts` (written with FR-7); ticked after checking each case.
- FR-8: the cancel endpoint sends `CancelAppointmentCommand` (returns nothing), then re-reads via `GetAppointmentQuery` for the 200 body. Integration test `test/lifecycle/cancel-appointment.int-spec.ts` rebooks the same bay + technician + time after a cancel, proving the DB exclusion constraint ignores cancelled rows. Known gap (deferred): two *simultaneous* cancels of the same appointment can both succeed (no row lock), the second overwriting `cancelledAt`. Harmless today (end state is still `CANCELLED`); add `SELECT … FOR UPDATE` or a conditional update if cancel ever gets side effects.
