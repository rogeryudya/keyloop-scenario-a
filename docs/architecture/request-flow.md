# Request flow

## Command (write)
```
HTTP POST /v1/appointments
 → ValidationPipe validates CreateAppointmentRequestDto            (presentation: shape/format)
 → AppointmentController maps DTO → new CreateAppointmentCommand(...)
 → commandBus.execute(cmd)                                     (mediator)
 → CreateAppointmentHandler                                        (application, @Transactional)
     • loads aggregates via AppointmentRepository port
     • calls domain: Appointment.create(...) → enforces invariants, may throw DomainError
     • persists via repository inside the transaction
     • returns { id }                                          (never a domain entity)
 → controller maps result → 201 response DTO
```

## Query (read)
```
GET /v1/appointments?cursor=..&limit=..
 → controller → queryBus.execute(new ListAppointmentsQuery(...))
 → ListAppointmentsHandler → reads via a repository/read port → returns Page<AppointmentView>
 → controller maps → 200 { data, meta: { nextCursor, limit } }
```
Queries skip the domain model: they may read straight into flat view objects for speed. They never change state.

## Error path
```
Domain/handler throws AppointmentConflictError (extends ConflictError)
 → bubbles through CommandBus unchanged
 → GlobalExceptionFilter maps ConflictError → 409
 → { "error": { "code": "APPOINTMENT_CONFLICT", "message": "...", "details": [] } }
```
Unknown errors → 500 `INTERNAL_ERROR`, logged with stack, generic message to the client.

## Request context
A CLS (AsyncLocalStorage) context is opened per request. It carries the request id (for logs) and the active Prisma transaction, so no code passes these around manually.
