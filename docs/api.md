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
| GET | `/v1/service-types` | List service types with durations (cursor pagination) | FR-10 | done |

### Module error codes
| Status | `code` | Endpoint | When |
|---|---|---|---|
| 404 | `DEALERSHIP_NOT_FOUND` | `GET /v1/dealerships/:id` | No dealership with that id (BR-13) |

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
