# Data types per layer: DTO, Command/Query, View, Entity, Model

Each layer has its own data types. A type belongs to exactly one layer and is converted at the boundary; it never leaks across.

## Vocabulary (use these words exactly)

| Term | Means | Never call it |
|---|---|---|
| **Request DTO** | Shape of incoming HTTP data | entity, model |
| **Response DTO** | Shape of outgoing HTTP data (the API contract) | entity, model |
| **Command / Query** | Use-case input message sent through the mediator | DTO, request |
| **View** | Use-case output (read model) returned by a handler | DTO, entity |
| **Entity** | Domain object with identity, behaviour and invariants | model, table, record |
| **Value object** | Immutable domain value without identity (`TimeSlot`, `Email`) | DTO, type |
| **Prisma model / row** | Storage shape generated from `schema.prisma` | entity |

"Model" on its own is ambiguous. Always say **Prisma model** (storage) or **read model / View** (application output).

## Overview

```
              HTTP JSON
                 │
 PRESENTATION    ▼
   CreateAppointmentRequestDto ──controller──▶ CreateAppointmentCommand
                                                  │ CommandBus
 APPLICATION                                      ▼
   CreateAppointmentHandler  ── uses ──▶  Appointment entity, TimeSlot value object
                                                  │
 DOMAIN            Appointment.create() enforces the rules
                                                  │ repository port
 INFRASTRUCTURE                                   ▼
   AppointmentMapper.toPersistence(entity) ──▶ Prisma model (AppointmentRow) ──▶ Postgres

 Read path (back up):
   Postgres ─▶ AppointmentRow ─▶ (mapper) Entity or direct read ─▶ AppointmentView
            ─▶ (controller) AppointmentResponseDto ─▶ HTTP JSON
```

## Per layer

### Presentation: DTOs
| | Request DTO | Response DTO |
|---|---|---|
| File | `presentation/dto/create-appointment.request.dto.ts` | `presentation/dto/appointment.response.dto.ts` |
| Purpose | Validate the **shape** of input | Define the public API contract |
| Contains | Fields + `class-validator` + Swagger decorators | Fields + Swagger decorators + `static from(view)` |
| Types | Primitives as sent over JSON (`string` dates) | Primitives as sent over JSON (ISO strings) |
| Behaviour | None | None besides `from()` |
| Created by | Nest `ValidationPipe` | Controller |
| Rule | No business rules (no "slot must be free") | Never return an entity, View or Prisma row directly |

```ts
export class CreateAppointmentRequestDto {
  @ApiProperty() @IsUUID() customerId!: string;
  @ApiProperty() @IsUUID() vehicleId!: string;
  @ApiProperty() @IsUUID() dealershipId!: string;
  @ApiProperty() @IsUUID() serviceTypeId!: string;
  @ApiProperty() @IsISO8601({ strict: true }) desiredStart!: string;   // must include offset
}

export class AppointmentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty() bayId!: string;
  @ApiProperty() technicianId!: string;
  @ApiProperty() start!: string;
  @ApiProperty() end!: string;

  static from(view: AppointmentView): AppointmentResponseDto {
    return {
      id: view.id, status: view.status, bayId: view.bayId, technicianId: view.technicianId,
      start: view.start.toISOString(), end: view.end.toISOString(),
    };
  }
}
```

### Application: Command / Query and View
| | Command / Query | View (read model) |
|---|---|---|
| File | `application/commands/create-appointment/create-appointment.command.ts` | `application/views/appointment.view.ts` |
| Purpose | Input to one use case | Output of a query (or rich command result) |
| Contains | Readonly, already-parsed fields (`Date`, not string) | Plain readonly fields, no methods |
| Framework | Extends `Command<T>` / `Query<T>` only | None (a `type` or `interface`) |
| Created by | Controller | Handler (from entity or direct DB read) |
| Rule | No validation decorators, no HTTP concepts | Not an entity: no behaviour, safe to hand outward |

Why not reuse the Request DTO as the command? The command must not depend on HTTP or `class-validator`. The same command can come from a controller, a CLI, a test or a message consumer, and a v2 API can send the same command from a different DTO.

```ts
export class CreateAppointmentCommand extends Command<{ id: string }> {
  constructor(
    public readonly customerId: string,
    public readonly vehicleId: string,
    public readonly dealershipId: string,
    public readonly serviceTypeId: string,
    public readonly desiredStart: Date,
  ) { super(); }
}

export type AppointmentView = Readonly<{
  id: string;
  customerId: string;
  status: AppointmentStatus;
  dealershipId: string;
  bayId: string;
  technicianId: string;
  start: Date;
  end: Date;
}>;
```

### Domain: Entity and Value object
| | Entity | Value object |
|---|---|---|
| File | `domain/appointment.entity.ts` | `domain/time-slot.ts` |
| Purpose | Business object with identity that enforces rules | Validated, immutable concept |
| Equality | By id | By value |
| Contains | Private state, factory (`create`/`restore`), behaviour methods | Validated fields, small pure methods (`overlaps()`) |
| Framework | **None** | **None** |
| Created by | `create()` in handlers; `restore()` in mappers | Anywhere in domain/application |
| Rule | Not a table, no ORM types; designed from business rules | Invalid instance cannot exist |

See [domain.md](domain.md) for entity rules and the entity vs table distinction.

### Infrastructure: Prisma model and Mapper
| | Prisma model (row) | Mapper |
|---|---|---|
| File | `prisma/schema.prisma` → generated `@prisma/client` types | `infrastructure/appointment.mapper.ts` |
| Purpose | Storage shape: columns, FKs, indexes | Convert row ⇄ entity |
| Contains | Flat columns (`startAt`, `endAt`, `updatedAt`) | `toDomain(row)`, `toPersistence(entity)`, optionally `toView(row)` |
| Used by | Repositories and mappers only | Repositories |
| Rule | Never leaves `infrastructure/` | Only place both Appointment types meet; import row as `AppointmentRow` |

```ts
import { Appointment as AppointmentRow } from '@prisma/client';

export const AppointmentMapper = {
  toDomain(row: AppointmentRow): Appointment {
    return Appointment.restore({
      id: row.id,
      customerId: row.customerId,
      status: row.status as AppointmentStatus,
      slot: TimeSlot.restore(row.startAt, row.endAt),   // 2 columns → 1 value object
      createdAt: row.createdAt,
    });
  },
  toPersistence(b: Appointment): Omit<AppointmentRow, 'updatedAt'> {
    const s = b.toSnapshot();
    return { id: s.id, customerId: s.customerId, status: s.status,
             startAt: s.slot.start, endAt: s.slot.end, createdAt: s.createdAt };
  },
};
```

## Who converts what

| Conversion | Where |
|---|---|
| JSON → Request DTO | `ValidationPipe` (presentation) |
| Request DTO → Command/Query | Controller |
| Command → Entity/Value objects | Handler (via `Entity.create`, `ValueObject.create`) |
| Entity ⇄ Prisma row | Mapper (infrastructure) |
| Entity or row → View | Handler, or a read repository for queries |
| View → Response DTO | Controller (`ResponseDto.from(view)`) |

## Quick checks
- Does a controller import from `domain/` or `@prisma/client`? → wrong.
- Does a handler return an entity? → wrong, return a View or `{ id }`.
- Does an entity file import `@prisma/client` or `class-validator`? → wrong.
- Does a Prisma type appear outside `infrastructure/`? → wrong.
- Is a Request DTO passed into a handler? → wrong, build a Command.
