# M2 — Booking with availability check (core of the brief)

**Status:** `in-progress`
**Goal:** a user can book an appointment; the system checks bay **and** qualified technician for the full duration, allocates them, and persists the appointment, staying correct under concurrent requests.
**Requirements:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, BR-3 … BR-11, BR-13, NFR-6

## Tasks
- [x] Domain service `ResourceAllocator` (pure): given slot, dealership bays, technicians qualified for the service type, and their `CONFIRMED` appointments → returns `{ bay, technician }` or throws `ServiceTypeNotSupported` / `NoServiceBayAvailable` / `NoTechnicianAvailable`; deterministic choice per BR-11
- [x] Unit tests for the allocator: every branch + boundaries (back-to-back free, 1-minute overlap busy, enclosing busy, cancelled ignored, unqualified technician ignored, other dealership ignored, bay free but technician busy and vice versa, tie-breaking)
- [x] Ports: `AppointmentRepository` (`save`, `findById`, `findConfirmedOverlapping(dealershipId, slot)`, `countForTechniciansOnDay`) and a read port for bookable resources (dealership + opening hours, bays, qualified technicians), implemented by querying the `dealerships` module via the QueryBus or a read adapter (decide and record in the module README)
- [x] `CreateAppointmentCommand` + handler (`@Transactional`): existence checks (BR-13) → vehicle ownership (BR-5) → future start (BR-3) → opening hours (BR-4) → load resources + overlapping appointments → allocate → `Appointment.create` → save → `{ id }`
- [x] Race safety: Prisma adapter maps exclusion violation (SQLSTATE `23P01`) to `AppointmentConflictError`; handler retries the whole command up to 3 times (another free bay/technician may exist), then returns 409 `APPOINTMENT_CONFLICT`
- [x] `GetAppointmentQuery` + handler → `AppointmentView` (with dealership, bay, technician, service type, vehicle, customer ids and names)
- [ ] `POST /v1/appointments` → 201 + `Location`; `GET /v1/appointments/:id`
- [ ] Handler unit tests with in-memory fakes + `FixedClock` for each error path
- [ ] Integration: Prisma repository contract tests; **concurrency test**: 10 parallel requests for the same slot at a dealership with 1 bay → exactly 1 succeeds, 9 get 409; with 2 bays and 2 qualified technicians → exactly 2 succeed
- [ ] e2e: happy path and one test per error code (400 validation, 404s, 422 BR-3/4/5/6, 409 BR-7/8)
- [ ] `docs/api.md`: request/response examples and the error code table

## Acceptance criteria
- All Must requirements (FR-1 … FR-6) demonstrably work via the API
- Every business rule BR-3 … BR-11, BR-13 has at least one named unit test
- The concurrency test passes reliably (run it 20× in a loop once)

## Notes
- `ResourceAllocator` takes `technicianDayLoad` (BR-11) as a separate map so it maps 1:1 to the planned `AppointmentRepository.countForTechniciansOnDay`. It takes `ExistingBooking` (a `Pick` of `AppointmentProps`), so the handler can pass `appointment.toSnapshot()`. It ignores other-dealership, unqualified and cancelled inputs itself, so a loose query in the handler cannot cause a double booking.
- Race retry: "up to 3 times" means 1 attempt + 3 retries (`MAX_CONFLICT_RETRIES`). Each attempt is its own `@Transactional()` call: Postgres aborts a transaction after `23P01`, so retrying inside it can't work. Don't call `CreateAppointmentHandler` from inside an outer transaction, because the attempts would join it.
- With the pg driver adapter, Prisma reports the exclusion violation as `PrismaClientKnownRequestError` with code `P2039`. The SQLSTATE is in `meta.driverAdapterError.cause.originalCode`, which is what the adapter checks.
