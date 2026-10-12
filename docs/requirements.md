# Requirements

Source of truth for *what* we build. AI assistants must not add features that aren't traceable to this file.

## 1. Original brief (verbatim)

> **Scenario A: The Unified Service Scheduler**
> - **Domain:** Ownership
> - **Task:** Build an Appointment Scheduler application to replace manual booking systems.
> - **Core Requirements:**
>   1. **Resource Constrained Booking:** Allow a user to request a service appointment for a specific vehicle, service type, and dealership at a desired time.
>   2. **Real-Time Availability Check:** Before confirming, check for the availability of both a ServiceBay and a qualified Technician for the entire service duration.
>   3. **Confirmed Appointment Record:** Upon success, create a persistent Appointment record associating the customer, vehicle, technician, and service bay.

## 2. Functional requirements
Priority: **Must** = in the brief; **Should** = small, directly supports the brief; **Could** = only if time allows.

| ID | Requirement | Source | Priority | Milestone |
|---|---|---|---|---|
| FR-1 | A user can request an appointment for a **vehicle**, **service type** and **dealership** at a **desired start time** | Brief 1 | Must | M2 |
| FR-2 | Before confirming, the system checks that **a ServiceBay** at that dealership **and a Technician qualified for the service type** are both free for the **entire service duration** `[start, start + duration)` | Brief 2 | Must | M2 |
| FR-3 | On success, a persistent **Appointment** is created linking customer, vehicle, technician and service bay (plus dealership, service type, start, end, status) | Brief 3 | Must | M2 |
| FR-4 | When the request can't be satisfied, it is rejected with a specific reason: no free bay, no free qualified technician, service not supported, outside opening hours, invalid request | Brief 2 (derived) | Must | M2 |
| FR-5 | Concurrent requests can never double-book the same bay or technician for overlapping times | Brief 2 "real-time" (derived) | Must | M2 |
| FR-6 | An appointment can be retrieved by id | Brief 3 (derived) | Must | M2 |
| FR-7 | A user can query available start times for a dealership + service type on a given date | Brief 2 (derived) | Should | M3 |
| FR-8 | An appointment can be cancelled, which frees its bay and technician | Derived | Should | M3 |
| FR-9 | Appointments can be listed per dealership or per customer (cursor pagination) | Derived | Could | M3 |
| FR-10 | Reference data can be read: dealerships, service types (so a client can build a request) | Derived | Should | M1 |
| FR-11 | Repeating a create request with the same `Idempotency-Key` doesn't create a second appointment | Derived (robustness) | Could | M3 |

## 3. Business rules
These are what the domain layer enforces and what M2/M3 unit tests must cover.

| ID | Rule | Error code (HTTP) |
|---|---|---|
| BR-1 | End time = start + `serviceType.durationMinutes` | — |
| BR-2 | Time intervals are half-open `[start, end)`: back-to-back appointments don't overlap | — |
| BR-3 | Start time must be in the future | `APPOINTMENT_IN_PAST` (422) |
| BR-4 | The whole interval must fall within the dealership's opening hours, in the dealership's time zone | `OUTSIDE_OPENING_HOURS` (422) |
| BR-5 | The vehicle must belong to the customer making the request | `VEHICLE_NOT_OWNED_BY_CUSTOMER` (422) |
| BR-6 | The dealership must have at least one technician qualified for the service type | `SERVICE_TYPE_NOT_SUPPORTED` (422) |
| BR-7 | A bay of the same dealership must be free for the whole interval | `NO_SERVICE_BAY_AVAILABLE` (409) |
| BR-8 | A technician of the same dealership, qualified for the service type, must be free for the whole interval | `NO_TECHNICIAN_AVAILABLE` (409) |
| BR-9 | Only `CONFIRMED` appointments occupy resources; `CANCELLED` ones don't | — |
| BR-10 | A bay or technician can never have two overlapping `CONFIRMED` appointments, enforced in the database as well as in code | `APPOINTMENT_CONFLICT` (409) on a lost race |
| BR-11 | Allocation is deterministic: among free candidates, pick the technician with the fewest appointments that day (tie → lowest id) and the lowest-id free bay | — |
| BR-12 | Only a `CONFIRMED` appointment can be cancelled | `APPOINTMENT_NOT_CANCELLABLE` (422) |
| BR-13 | Referenced dealership, service type, customer and vehicle must exist | `*_NOT_FOUND` (404) |

## 4. Non-functional requirements
| ID | Requirement | Notes |
|---|---|---|
| NFR-1 | Runs locally with one documented command sequence (Docker Compose: floci RDS + Secrets Manager) | Reviewer experience |
| NFR-2 | Input validated; consistent error responses | See conventions.md |
| NFR-3 | Automated tests for business rules and main API flows | Including a concurrency test for FR-5 |
| NFR-4 | API documented via OpenAPI/Swagger | |
| NFR-5 | Observable: traces, structured logs and metrics via OpenTelemetry | Local: Grafana LGTM; prod-ready for Datadog |
| NFR-6 | Booking stays correct under concurrent requests (no double-booking) | Backs FR-5 / BR-10 |

## 5. Domain glossary
Use these exact terms in code (class names, table names, endpoints).

| Term | Meaning | Module |
|---|---|---|
| **Dealership** | A site that performs services. Has a time zone and daily opening hours | `dealerships` |
| **ServiceBay** | A physical bay at one dealership where a vehicle is serviced. One appointment at a time | `dealerships` |
| **Technician** | A person employed at one dealership who performs services. One appointment at a time | `dealerships` |
| **ServiceType** | A kind of service (e.g. oil change), with a fixed `durationMinutes` | `dealerships` |
| **Qualification** | That a technician is qualified to perform a service type (technician ↔ service type, many-to-many) | `dealerships` |
| **Customer** | The person requesting the appointment | `customers` |
| **Vehicle** | A car owned by a customer, identified by VIN (+ registration) | `customers` |
| **Appointment** | A confirmed reservation of one bay + one technician for a vehicle, service type and time interval. Status `CONFIRMED` or `CANCELLED` | `appointments` |
| **TimeSlot** | Value object: half-open interval `[start, end)` with `overlaps()` | `shared/domain` |
| **OpeningHours** | Value object: a dealership's daily window `opensAt`–`closesAt` in its IANA time zone, with `contains(slot)` | `shared/domain` |
| **Availability** | The start times at which a service type can currently be booked at a dealership | `appointments` |

## 6. Assumptions
Made where the brief is silent. Format: `A-n: assumption — reason`.

- A-1: No authentication; the request carries `customerId`. — Identity isn't in the brief; keeps scope on scheduling.
- A-2: Reference data (dealerships, bays, technicians, qualifications, service types, customers, vehicles) is seeded; there is no admin CRUD. — The brief is about booking, not master data.
- A-3: Each service type has a fixed duration; one appointment = one service type. — Simplest reading of "the entire service duration".
- A-4: The system auto-assigns the bay and technician; the client doesn't choose them. — The brief asks to check resource availability, not to pick resources.
- A-5: Any bay can host any service type (no bay capabilities). — Not mentioned; could be added later as a bay-type rule.
- A-6: Dealership opening hours are one daily window (e.g. 08:00–18:00, every day) in the dealership's time zone; technicians work all opening hours. — Needed so availability (FR-7) is meaningful; shifts and breaks are out of scope.
- A-7: API times are ISO-8601 with offset; stored as UTC. — Avoids time zone ambiguity.
- A-8: Check and reservation happen in one transaction; there is no "hold/pending" state. — "Before confirming, check" → atomic check-and-confirm.
- A-9: Availability (FR-7) offers start times on a 15-minute grid. — A reasonable default granularity.
- A-10: There are no external systems to call, so WireMock isn't needed for this scope.
- A-11: Opening hours are whole minutes (`HH:mm`, `00:00`–`23:59`), and an appointment must start and end on the same local day; ending exactly at closing time is allowed. — Follows from A-6 (one daily window, no overnight opening) and BR-2 (half-open intervals).
- A-12: `GET /v1/dealerships/:id` returns the dealership plus `supportedServiceTypeIds` (service types at least one of its technicians is qualified for, BR-6); bays and technicians aren't exposed. Reference lists use the standard `createdAt DESC, id DESC` cursor order. — Enough for a client to build a booking request (FR-10) without exposing staff data.
- A-13: When neither a bay nor a qualified technician is free, the booking fails with `NO_SERVICE_BAY_AVAILABLE` (BR-7 is checked before BR-8); `SERVICE_TYPE_NOT_SUPPORTED` (BR-6) is checked before both. — The brief names no precedence; reporting one stable code keeps clients simple.
- A-14: Availability (FR-7) takes a calendar date (`YYYY-MM-DD`) meaning that day in the dealership's time zone; storage stays UTC (A-7). The 15-minute grid (A-9) counts from `opensAt` (opening 08:10 → 08:10, 08:25, …). Asking for a service type the dealership can't perform returns 422 `SERVICE_TYPE_NOT_SUPPORTED` (same code as booking, BR-6) with an availability-specific message. — Local dates match how customers think; one stable code keeps clients simple.
- A-15: Listing appointments (FR-9) requires `dealershipId` or `customerId` (both → both must match); optional `from`/`to` (ISO-8601 with offset) filter on start time, `[from, to)`, and an empty or reversed range just returns nothing. Cancelled appointments are included; items have the `GET /v1/appointments/:id` shape; unknown ids give an empty page, not 404. Order is the standard `createdAt DESC, id DESC`. — Simplest reading of "per dealership or per customer"; matches the cursor convention and existing indexes.
- A-16: `Idempotency-Key` (FR-11) is optional on `POST /v1/appointments`: 1–255 visible ASCII characters, case-sensitive, global (no auth), never expires. "Same body" means the same customer, vehicle, dealership, service type and start **instant** (offset notation doesn't matter). Only successful bookings store the key (on the appointment), so a failed request may be retried with the same key; a cancelled booking keeps its key and is still replayed. A known key is answered first, before any other check, with the original `201` + `Location`; a different body under a known key → 422 `IDEMPOTENCY_KEY_REUSED`. — Smallest design that meets "same response, no second appointment"; see ADR-0007.

## 7. Open questions
For the interviewer. Don't block on them; the matching assumption applies until answered.

- Q-1: Is there more to the brief (further pages, deliverables, time box, presentation format)?
- Q-2: Should the customer be able to choose or prefer a technician? (A-4)
- Q-3: Do bays have capabilities, e.g. a lift needed for some services? (A-5)
- Q-4: Do technician shifts, breaks or holidays matter? (A-6)
- Q-5: Are cancel/reschedule in scope? (FR-8 assumed Should; reschedule out)
- Q-6: If the desired time is unavailable, should the API suggest alternatives? (Could reuse FR-7)

## 8. Out of scope
- Authentication/authorization, user accounts
- Admin CRUD for dealerships, bays, technicians, service types, customers, vehicles
- Rescheduling, recurring appointments, multi-service appointments
- Technician shifts, breaks, holidays; bay capabilities
- Notifications (email/SMS), payments, pricing
- Frontend/UI; production deployment to real AWS
