# Conventions

## Naming
- Files: `kebab-case` (`create-appointment.handler.ts`). Classes: `PascalCase`. Variables/functions: `camelCase`. Constants: `UPPER_SNAKE_CASE`.
- Use domain terms from the glossary in `requirements.md` exactly — no synonyms.
- The `Dto` suffix is used **only in presentation** (HTTP boundary): `CreateXRequestDto`, `UpdateXRequestDto`, `XResponseDto`, `ListXQueryDto` (query-string params). Files: `create-x.request.dto.ts`, `x.response.dto.ts`.
  The suffix also avoids clashing with CQRS names (`ListXQueryDto` vs `ListXQuery`). Domain/application types never end in `Dto`.
- CQRS: `CreateXCommand` + `CreateXHandler` in `application/commands/create-x/`; `GetXQuery` + `GetXHandler` in `application/queries/get-x/`. Command names are imperative verbs; query names start with `Get`/`List`/`Find`.
- Ports: `XRepository` (abstract class, `domain/`). Adapters: `PrismaXRepository` (`infrastructure/`). Test fakes: `InMemoryXRepository`.
- Domain errors: `XNotFoundError`, `XConflictError` (extend shared base errors), with `code` like `X_NOT_FOUND`.
- Handler results / read models: `XView` in `application/views/x.view.ts`.
- DB: Prisma models `PascalCase` singular; mapped tables `snake_case` plural via `@@map`.
- "Entity" means the **domain** class (`Appointment` in `appointment.entity.ts`). Prisma types are "models"/"rows"; when both are needed in one file (mappers only), import the Prisma type with an alias: `import { Appointment as AppointmentRow } from '@prisma/client'`.

## TypeScript
- `strict` on. No `any` (use `unknown` + narrowing). Explicit return types on exported functions.
- Prefer `readonly`, union types/enums for fixed values, early returns over nested ifs.
- Never expose Prisma types or domain entities outside their layer: Prisma ↔ entity in infrastructure mappers, entity → `XView` in handlers, `XView` → `XResponseDto` in controllers.
- No `new Date()` in domain/application; use the injected `Clock`.

## API
- REST, JSON, plural resource nouns: `GET /v1/vehicles`, `POST /v1/vehicles/:id/appointments`.

### Versioning
- URI versioning via Nest: `app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })` → every route is `/v{n}/...`.
- Only a major version appears in the URL. Start at `v1`; there is no `v0` and no minor versions in the path.
- Operational endpoints are unversioned (`VERSION_NEUTRAL`): `/health`, `/docs`.
- **Non-breaking (stay on the same version):** adding an endpoint, adding an optional request field, adding a response field, adding a new error `code`.
- **Breaking (needs `v2`):** removing/renaming a field or endpoint, changing a type or meaning, making an optional field required, changing status codes or the error/pagination envelope.
- A new version is a presentation concern only: add `v2` controllers/DTOs (`@Version('2')`) that send the **same** commands/queries where possible. Domain and application are not versioned.
- When `v2` ships, mark `v1` routes deprecated in Swagger and send `Deprecation` + `Sunset` headers. Record each new version in an ADR.
- Clients must ignore unknown response fields (tolerant reader), which is what keeps additive changes non-breaking.
- Status codes: 200 read/update, 201 create, 204 delete, 400 validation, 404 not found, 409 conflict, 422 business-rule violation.
- IDs: UUID. Dates: ISO-8601 UTC strings.
- List endpoints use **cursor (token) pagination**, not page/offset:
  - Request: `?limit=20&cursor=<opaque>` (`limit` default 20, max 100; omit `cursor` for the first page).
  - Response: `{ data: [...], meta: { nextCursor: string | null, limit } }` — `nextCursor: null` means no more results.
  - Cursor is an opaque base64url string encoding the last item's sort key (`createdAt` + `id` as tiebreaker). Clients must not parse it.
  - Results always have a stable order (default `createdAt DESC, id DESC`); query with Prisma `cursor` + `skip: 1` or a `WHERE (createdAt, id) < (...)` condition.
  - Invalid/tampered cursor → 400 `INVALID_CURSOR`.
  - No `total` by default (an expensive count); add it only if the brief requires it.

## Errors
Every error response has this shape:
```json
{
  "error": {
    "code": "APPOINTMENT_CONFLICT",
    "message": "Human readable message",
    "details": [ { "field": "startTime", "issue": "must be in the future" } ]
  }
}
```
- `code` is a stable `UPPER_SNAKE_CASE` string clients can switch on.
- Unknown errors → 500 `INTERNAL_ERROR`, logged with stack, generic message to client.

## Validation
- `class-validator` + `class-transformer` on every DTO; global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- DTOs validate **shape** only (types, formats, required). Business rules (cross-field, state, DB-dependent) belong in domain/handlers.

## Testing
- Full strategy, environments and test doubles: see `testing/README.md`.
- Unit tests: `*.spec.ts` next to the code. Domain tests are pure; handler tests use `InMemoryXRepository` fakes and a fixed `Clock` (prefer fakes to `jest.fn()` mocks).
- Test names read as behaviour: `it('rejects an appointment that overlaps an existing one')`.
- e2e tests: `test/*.e2e-spec.ts`, real Postgres (test DB), Supertest against the Nest app. Reset DB between suites.
- Every business rule: happy path + each failure branch + boundary values.
- No snapshot tests for API responses; assert on fields that matter.

## Logging
- pino (structured JSON) with `request_id` + `trace_id` (see `local-dev/observability.md`). Log at boundaries and on errors, not in loops. Never log secrets or full request bodies with personal data.

## Git
- Conventional commits: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`. Reference IDs when relevant: `feat(appointment): create appointment endpoint (FR-3)`.
- Small commits, one milestone task each where possible.
- All changes reach `main` via PR so CI and Bugbot run (see `ci.md`). PR title = conventional commit; squash merge.
