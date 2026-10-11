# M3 — Availability query and appointment lifecycle

**Status:** `todo`
**Goal:** clients can see when a service can be booked, cancel appointments, and list them.
**Requirements:** FR-7, FR-8, FR-9, FR-11, BR-9, BR-12

## Tasks
- [ ] FR-7 `GetAvailabilityQuery`: for dealership + service type + date, return start times on a 15-minute grid within opening hours, not in the past, where `ResourceAllocator` would succeed. Load the day's appointments once and compute in memory (no query per slot)
- [ ] `GET /v1/dealerships/:id/availability?serviceTypeId=&date=` → `{ data: [{ start, end }] }` in the dealership's time zone offset
- [ ] Unit tests: fully free day, fully booked day, slots blocked only by technician qualification, last slot that just fits before closing, today with past slots removed
- [ ] FR-8 `CancelAppointmentCommand`: `Appointment.cancel(now)` (BR-12); `POST /v1/appointments/:id/cancel` → 200 with the updated appointment; cancelled slot becomes bookable again (integration test)
- [ ] FR-9 `ListAppointmentsQuery`: filter by `dealershipId` or `customerId` (+ optional date range), cursor pagination; `GET /v1/appointments`
- [ ] FR-11 (Could) `Idempotency-Key` header on `POST /v1/appointments`: same key + same body → same response, no second appointment; same key + different body → 422
- [ ] e2e tests for each endpoint; `docs/api.md` updated

## Acceptance criteria
- A slot returned by the availability endpoint can be booked immediately (e2e)
- Cancelling frees the slot: availability shows it again and booking it succeeds
- List endpoints follow the cursor pagination convention

## Notes
- If time is short, FR-9 and FR-11 can be dropped; record that in the design notes.
