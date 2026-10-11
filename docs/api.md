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

## Changelog
Record every API change here. Mark breaking changes clearly; they require a new major version.

- v1: initial

## Examples

### GET /health
Response `200`
```json
{ "status": "ok", "db": "up" }
```
