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
| GET | `/health` | Liveness + DB check | NFR-1 | planned |

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

## Examples

### GET /health
Response `200`
```json
{ "status": "ok", "db": "up" }
```
