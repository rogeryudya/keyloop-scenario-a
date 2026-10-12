# API

Human-readable summary. Swagger at `/docs` is the full contract; keep both in sync.
Error format, status codes, pagination and versioning rules: see `conventions.md`.

## Versions
| Version | Base path | Status | Notes |
|---|---|---|---|
| v1 | `/v1` | current | Initial version |

Unversioned: `/health`, `/docs`.

## Endpoints
| Method | Path | Purpose | Req ID | Status |
|---|---|---|---|---|
| GET | `/health` | Liveness + DB check (`SELECT 1`, 2 s timeout) | NFR-1 | done |
| GET | `/v1/dealerships` | List dealerships (cursor pagination) | FR-10 | done |
| GET | `/v1/dealerships/:id` | One dealership + the service types it supports | FR-10 | done |
| GET | `/v1/dealerships/:id/availability?serviceTypeId=&date=` | Bookable slots for a service type on a local date (15-min grid, local time with offset) | FR-7 | done |
| GET | `/v1/service-types` | List service types with durations (cursor pagination) | FR-10 | done |
| POST | `/v1/appointments` | Book an appointment; bay and technician are allocated (201 + `Location`) | FR-1…FR-5 | done |
| GET | `/v1/appointments/:id` | One appointment with linked dealership, bay, technician, service type, customer, vehicle | FR-6 | done |
| POST | `/v1/appointments/:id/cancel` | Cancel a confirmed appointment; frees its bay and technician (200 + the updated appointment) | FR-8 | done |

### Module error codes
| Status | `code` | Endpoint | When |
|---|---|---|---|
| 404 | `DEALERSHIP_NOT_FOUND` | `GET /v1/dealerships/:id`, `GET …/availability`, `POST /v1/appointments` | No dealership with that id (BR-13) |
| 404 | `SERVICE_TYPE_NOT_FOUND` | `GET …/availability`, `POST /v1/appointments` | No service type with that id (BR-13) |
| 404 | `CUSTOMER_NOT_FOUND` | `POST /v1/appointments` | No customer with that id (BR-13) |
| 404 | `VEHICLE_NOT_FOUND` | `POST /v1/appointments` | No vehicle with that id (BR-13) |
| 404 | `APPOINTMENT_NOT_FOUND` | `GET /v1/appointments/:id`, `POST …/:id/cancel` | No appointment with that id |
| 422 | `APPOINTMENT_NOT_CANCELLABLE` | `POST /v1/appointments/:id/cancel` | The appointment is not `CONFIRMED` (already cancelled) (BR-12) |
| 422 | `VEHICLE_NOT_OWNED_BY_CUSTOMER` | `POST /v1/appointments` | The vehicle belongs to another customer (BR-5) |
| 422 | `APPOINTMENT_IN_PAST` | `POST /v1/appointments` | `start` is not after the current time (BR-3) |
| 422 | `OUTSIDE_OPENING_HOURS` | `POST /v1/appointments` | `[start, start + duration)` doesn't fit in one day's opening hours, local time (BR-4) |
| 422 | `SERVICE_TYPE_NOT_SUPPORTED` | `GET …/availability`, `POST /v1/appointments` | No technician at the dealership is qualified for the service type (BR-6). Same code on both endpoints; the message differs (A-14) |
| 409 | `NO_SERVICE_BAY_AVAILABLE` | `POST /v1/appointments` | Every bay at the dealership is busy for part of the slot (BR-7) |
| 409 | `NO_TECHNICIAN_AVAILABLE` | `POST /v1/appointments` | Every qualified technician is busy for part of the slot (BR-8) |
| 409 | `APPOINTMENT_CONFLICT` | `POST /v1/appointments` | Concurrent bookings kept taking the free resources; still failing after 3 retries (BR-10). Safe to retry |

`POST /v1/appointments` checks in this order and reports the first failure: request shape (400) → dealership,
service type, customer, vehicle exist (404) → vehicle ownership (422) → future start, opening hours (422) →
service supported (422) → bay (409) → technician (409) (A-13).

## Generic error codes
Returned by the platform for any endpoint, in the standard error format (`conventions.md` › Errors). Module-specific codes are listed with their endpoints.

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_FAILED` | Request body/query/params failed DTO validation; `details[]` lists `{ field, issue }` (nested fields dotted) |
| 400 | `INVALID_CURSOR` | Pagination cursor not produced by this API |
| 400 | `BAD_REQUEST` | Malformed request, e.g. invalid JSON body |
| 404 | `NOT_FOUND` | Unknown route |
| 4xx | HTTP status name (e.g. `PAYLOAD_TOO_LARGE`) | Other client errors raised by the framework |
| 500 | `INTERNAL_ERROR` | Anything unexpected; generic message, details logged server-side only |

## Changelog
Record every API change here. Mark breaking changes clearly; they require a new major version.

- v1: initial
- v1 (M1): added `GET /v1/dealerships`, `GET /v1/dealerships/:id`, `GET /v1/service-types` (non-breaking)
- v1 (M2): added `POST /v1/appointments`, `GET /v1/appointments/:id` (non-breaking)
- v1 (M3): added `GET /v1/dealerships/:id/availability`, `POST /v1/appointments/:id/cancel` (non-breaking)

## Examples

### GET /health
Response `200`
```json
{ "status": "ok", "db": "up" }
```
Response `503` (DB unreachable; standard error format)
```json
{ "error": { "code": "SERVICE_UNAVAILABLE", "message": "Database is unreachable", "details": [ { "field": "db", "issue": "down" } ] } }
```

### Pagination (all list endpoints)
`?limit=1..100` (default 20) and `?cursor=<meta.nextCursor>`. Order: `createdAt DESC, id DESC`. Unknown query parameters → 400 `VALIDATION_FAILED`.

### GET /v1/dealerships?limit=2
Response `200`
```json
{
  "data": [
    { "id": "10000000-0000-4000-8000-000000000003", "name": "Keyloop Express Hanoi", "timeZone": "Asia/Ho_Chi_Minh",
      "openingHours": { "opensAt": "09:00", "closesAt": "17:00" } },
    { "id": "10000000-0000-4000-8000-000000000002", "name": "Keyloop Motors Ho Chi Minh City", "timeZone": "Asia/Ho_Chi_Minh",
      "openingHours": { "opensAt": "08:00", "closesAt": "17:00" } }
  ],
  "meta": { "nextCursor": "eyJjIjoi…", "limit": 2 }
}
```
`openingHours` are local wall-clock times in `timeZone`, the same every day (A-6). An appointment must start at or after `opensAt` and end at or before `closesAt` (BR-4).

### GET /v1/dealerships/:id
Response `200`
```json
{
  "id": "10000000-0000-4000-8000-000000000003",
  "name": "Keyloop Express Hanoi",
  "timeZone": "Asia/Ho_Chi_Minh",
  "openingHours": { "opensAt": "09:00", "closesAt": "17:00" },
  "supportedServiceTypeIds": [
    "40000000-0000-4000-8000-000000000001",
    "40000000-0000-4000-8000-000000000002",
    "40000000-0000-4000-8000-000000000003",
    "40000000-0000-4000-8000-000000000006"
  ]
}
```
`supportedServiceTypeIds`: service types at least one technician here is qualified for (BR-6, A-12). Booking any other type returns `SERVICE_TYPE_NOT_SUPPORTED`.
Response `404`: `DEALERSHIP_NOT_FOUND`. A malformed id → `400 VALIDATION_FAILED` with `details[0].field = "id"`.

### GET /v1/dealerships/:id/availability?serviceTypeId=…&date=2030-01-15
`date` is a calendar date in the dealership's time zone (A-14). Slots are 15 minutes apart counted from
opening time (A-9), end by closing time, start after now, and have a free bay and qualified technician
for the whole service; any of them can be booked with `POST /v1/appointments` using its `start`.
Response `200` (Bangkok, oil change = 30 min):
```json
{
  "data": [
    { "start": "2030-01-15T08:00:00+07:00", "end": "2030-01-15T08:30:00+07:00" },
    { "start": "2030-01-15T08:15:00+07:00", "end": "2030-01-15T08:45:00+07:00" },
    { "start": "2030-01-15T17:30:00+07:00", "end": "2030-01-15T18:00:00+07:00" }
  ]
}
```
(truncated). Times carry the dealership's UTC offset at that instant. A day that is over, or fully booked,
returns `{ "data": [] }`. Errors: `400 VALIDATION_FAILED` (bad id, `serviceTypeId` or `date`),
`404 DEALERSHIP_NOT_FOUND` / `SERVICE_TYPE_NOT_FOUND`, `422 SERVICE_TYPE_NOT_SUPPORTED`.

### GET /v1/service-types
Response `200`
```json
{
  "data": [
    { "id": "40000000-0000-4000-8000-000000000007", "code": "TRANSMISSION_REPAIR", "name": "Transmission repair", "durationMinutes": 180 }
  ],
  "meta": { "nextCursor": null, "limit": 20 }
}
```
`durationMinutes` sets the appointment length: end = start + duration (BR-1).

### POST /v1/appointments
Books the service. The system picks the bay and technician (A-4): the lowest-id free bay, and the
free qualified technician with the fewest appointments that day (tie → lowest id) (BR-11).

Request
```json
{
  "customerId": "50000000-0000-4000-8000-000000000001",
  "vehicleId": "60000000-0000-4000-8000-000000000001",
  "dealershipId": "10000000-0000-4000-8000-000000000001",
  "serviceTypeId": "40000000-0000-4000-8000-000000000001",
  "start": "2030-01-15T10:00:00+07:00"
}
```
- All ids are UUIDs. `start` is ISO-8601 **with an offset** (`Z` or `±HH:mm`, A-7). Unknown fields
  (for example a `serviceBayId`) are rejected with 400.
- End = start + the service type's `durationMinutes` (BR-1). Intervals are half-open, so back-to-back
  bookings on the same bay or technician are fine (BR-2).

Response `201`, header `Location: /v1/appointments/{id}`
```json
{ "id": "0b9c7a52-6a8e-4c3e-9d0f-2f7f1c1e4a10" }
```

Response `409` (all bays taken)
```json
{ "error": { "code": "NO_SERVICE_BAY_AVAILABLE", "message": "No service bay is free for the whole requested slot", "details": [] } }
```

Response `422` (slot runs past closing time)
```json
{ "error": { "code": "OUTSIDE_OPENING_HOURS", "message": "The appointment must fall within the dealership's opening hours",
  "details": [ { "field": "start", "issue": "service would not fit within opening hours on that day" } ] } }
```

### GET /v1/appointments/:id
Response `200`
```json
{
  "id": "0b9c7a52-6a8e-4c3e-9d0f-2f7f1c1e4a10",
  "status": "CONFIRMED",
  "start": "2030-01-15T03:00:00.000Z",
  "end": "2030-01-15T03:30:00.000Z",
  "createdAt": "2030-01-14T00:00:00.000Z",
  "cancelledAt": null,
  "dealership": { "id": "10000000-0000-4000-8000-000000000001", "name": "Keyloop Motors Bangkok", "timeZone": "Asia/Bangkok" },
  "serviceBay": { "id": "20000000-0000-4000-8000-000000000101", "name": "Bay 1" },
  "technician": { "id": "30000000-0000-4000-8000-000000000101", "name": "Anong Srisuk" },
  "serviceType": { "id": "40000000-0000-4000-8000-000000000001", "code": "OIL_CHANGE", "name": "Oil and filter change", "durationMinutes": 30 },
  "customer": { "id": "50000000-0000-4000-8000-000000000001", "name": "Somsak Jaidee" },
  "vehicle": { "id": "60000000-0000-4000-8000-000000000001", "registration": "1กข 2345", "make": "Toyota", "model": "Corolla Altis" }
}
```
Times are returned in UTC; convert with `dealership.timeZone` for display.
Response `404`: `APPOINTMENT_NOT_FOUND`. A malformed id → `400 VALIDATION_FAILED` with `details[0].field = "id"`.

### POST /v1/appointments/:id/cancel
No body. Response `200`: the appointment in the `GET /v1/appointments/:id` shape, with
`"status": "CANCELLED"` and `"cancelledAt"` set. Its bay and technician are free again at once, so the slot
reappears in availability and can be booked (BR-9).
Errors: `404 APPOINTMENT_NOT_FOUND`, `422 APPOINTMENT_NOT_CANCELLABLE` (already cancelled, BR-12),
`400 VALIDATION_FAILED` for a malformed id.
