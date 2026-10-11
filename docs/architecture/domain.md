# Domain layer

Pure TypeScript. Holds the business rules the assignment is judged on.

## Rules
- **No framework code**: no `@nestjs/*`, `@prisma/client` or `class-validator`. Testable with plain `new`.
- No hidden non-determinism: time comes in as a parameter (from the `Clock` port in the handler); ids are passed in by the handler.
- Invalid state must be unrepresentable: validate in factories/constructors and expose no setters.

## Domain entity ≠ database table
A domain **entity** is a business object with behaviour. A Prisma **model** is a storage shape. They are separate types, often with different shapes, connected only by the mapper in infrastructure.

| | Domain entity | Prisma model |
|---|---|---|
| Lives in | `modules/*/domain/*.entity.ts` | `prisma/schema.prisma` (used only in `infrastructure/`) |
| Has | Methods, invariants, value objects | Columns, FKs, indexes, `@map` |
| Shaped by | Business rules | Storage and query needs |

- Never put Prisma/ORM decorators or generated types on an entity, and never add behaviour to a Prisma type.
- Shapes may differ: a `TimeSlot` value object can be two columns, one aggregate can span several tables, technical columns (`updatedAt`, `version`) need not exist in the domain.
- Design the entity from the business rules first, then design the table to store it, not the other way round.
- Wording: "entity" always means the domain class; say "Prisma model", "row" or "table" for persistence.

## Entities
- Have identity and protect their own invariants.
- Created via a static factory (`Appointment.create(input)`) that enforces creation rules. Rebuilt from storage via `Appointment.restore(props)`, which skips creation rules because stored data is already valid.
- State changes go through intention-revealing methods (`appointment.cancel(now)`, `appointment.reschedule(slot, now)`), never through property assignment.
- Expose read-only getters. A `toSnapshot()` returning a plain object is allowed for mappers.

```ts
export class Appointment {
  private constructor(private props: AppointmentProps) {}

  static create(input: CreateAppointmentInput): Appointment {
    if (input.slot.start <= input.now) throw new AppointmentInPastError();                       // BR-3
    if (!input.dealership.openingHours.contains(input.slot)) throw new OutsideOpeningHoursError(); // BR-4
    const { dealership, now, ...rest } = input;
    return new Appointment({
      ...rest,
      dealershipId: dealership.id,
      status: AppointmentStatus.Confirmed,
      createdAt: now,
    });
  }

  static restore(props: AppointmentProps): Appointment {
    return new Appointment(props);
  }

  cancel(now: Date): void {
    if (this.props.status !== AppointmentStatus.Confirmed) throw new AppointmentNotCancellableError(); // BR-12
    this.props = { ...this.props, status: AppointmentStatus.Cancelled, cancelledAt: now };
  }

  get id(): string { return this.props.id; }
  get status(): AppointmentStatus { return this.props.status; }
}
```

## Value objects
Immutable, compared by value, validated on construction: `TimeSlot` (half-open `[start, end)`, `overlaps()`), `OpeningHours` (daily window in a time zone, `contains(slot)`), `Vin`. Use one for any primitive that carries rules (format, range, ordering).

## Domain services
Rules that span several entities. Here: `ResourceAllocator.allocate({ slot, bays, technicians, busy })` picks a free bay and a free qualified technician (BR-6/7/8/11), or throws the specific error. It's a pure function: the handler loads the data and calls it, which makes every branch unit-testable without a database.

## Repository ports
`abstract class AppointmentRepository` in `domain/`, with methods phrased in domain language (`findById`, `save`, `findConfirmedOverlapping(dealershipId, slot)`). It takes and returns entities, and doubles as the Nest DI token, so no string tokens are needed.

## Errors
```
DomainError (abstract, has `code`)
 ├─ ValidationError         → 400
 ├─ NotFoundError           → 404
 ├─ ConflictError           → 409
 └─ BusinessRuleError       → 422
```
- Base classes live in `shared/domain/errors`. Module errors extend them: `AppointmentConflictError extends ConflictError`, code `APPOINTMENT_CONFLICT`.
- The HTTP mapping lives only in the exception filter (presentation). Domain code never knows about HTTP.

## Domain events (only if the brief needs side effects)
Entities record events (`AppointmentCreated`) in an internal list. The handler publishes them via `EventBus` **after** commit, and `@EventsHandler` classes react. Don't add events speculatively.
