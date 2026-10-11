# Folder structure

```
src/
  main.ts                         bootstrap: URI versioning, ValidationPipe, exception filter, Swagger
  app.module.ts
  config/                         env schema + typed config
  shared/
    domain/                       base Entity, ValueObject, DomainError hierarchy, Clock port
    application/                  pagination types (Cursor, Page<T>), shared ports
    infrastructure/
      prisma/                     PrismaModule, PrismaService, transaction setup
      clock/                      SystemClock
    presentation/
      filters/                    GlobalExceptionFilter (DomainError → HTTP)
      interceptors/               logging / request-id
      dto/                        ErrorResponseDto, CursorQueryDto, PageResponseDto
  modules/
    appointment/
      appointment.module.ts           wires handlers, binds ports → adapters
      domain/
        appointment.entity.ts
        appointment-status.ts         value object / enum
        appointment.errors.ts         AppointmentConflictError extends ConflictError ...
        appointment.repository.ts     abstract class AppointmentRepository (port + DI token)
        *.spec.ts                 pure unit tests, no Nest
      application/
        commands/
          create-appointment/
            create-appointment.command.ts
            create-appointment.handler.ts
            create-appointment.handler.spec.ts
        queries/
          get-appointment/
            get-appointment.query.ts
            get-appointment.handler.ts
          list-appointments/ ...
        views/                    read models returned by handlers (AppointmentView)
      infrastructure/
        prisma-appointment.repository.ts
        appointment.mapper.ts         Prisma row ↔ domain entity
      presentation/
        appointment.controller.ts
        dto/                      CreateAppointmentRequestDto, AppointmentResponseDto
  health/                         plain controller, outside CQRS (infra concern)
prisma/                           schema.prisma, migrations/, seed.ts
  seed/                           data.json (mock reference data) + README (demo scenarios)
src/instrumentation.ts            OpenTelemetry setup, loaded before Nest
scripts/local/                    with-db-url.ts (local tooling only)
infra/                            Terraform: modules/ + envs/local (floci), envs/aws-dev (see docs/infrastructure.md)
test/
  e2e/                            *.e2e-spec.ts
  fakes/                          InMemoryXRepository, FixedClock
  builders/                       aX() test data builders
  contracts/                      repository contract suites (fake + Prisma)
  helpers/                        app factory, DB reset, Testcontainers setup
  wiremock/                       mappings/ + __files/ for external HTTP stubs
  http/                           .http files for manual testing
docker-compose.yml                floci, otel-lgtm, wiremock (+ datadog profile)
```

## Rules
- One folder per use case (`create-appointment/`) keeps the command, handler and test together. Add a use case by adding a folder, not by editing a big service.
- `shared/` holds only things used by **two or more** modules. Don't move code there pre-emptively.
- A module never imports another module's `domain/` or `infrastructure/`. Cross-module calls go through the other module's commands/queries (mediator) or an exported application port.

## Adding a new module (checklist)
1. `modules/<name>/` with the four layer folders.
2. Entity + repository port in `domain/`.
3. Prisma model + migration; `Prisma<Name>Repository` + mapper in `infrastructure/`.
4. First command/query folder in `application/`.
5. Controller + DTOs in `presentation/`.
6. `<name>.module.ts`: import `CqrsModule`, register handlers, bind `{ provide: XRepository, useClass: PrismaXRepository }`.
7. Register the module in `app.module.ts`.
