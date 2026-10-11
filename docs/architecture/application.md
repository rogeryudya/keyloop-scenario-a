# Application layer

Use cases. Orchestrates domain objects and ports, and owns transactions. Its only logic is orchestration: load, let the domain decide, save.

## Commands and queries
- Plain classes with readonly fields, no decorators and no logic. Extend `Command<TResult>` / `Query<TResult>` from `@nestjs/cqrs` (v11+) so `execute()` is typed.
- Commands are imperative (`CreateAppointment`, `CancelAppointment`). Queries start with `Get`/`List`/`Find`.
- Command results are minimal (`{ id }` or `void`). The client re-reads via a query if it needs more.
- Fields are already-parsed primitives and `Date`s. No DTO classes and no `class-validator` here.

## Handlers
- One handler per command/query, in the same folder.
- Depends only on ports (abstract classes) and the `Clock`, never on concrete adapters or Prisma.
- Returns `XView`, `Page<XView>` or `{ id }`, never a domain entity.

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

@CommandHandler(CreateAppointmentCommand)
export class CreateAppointmentHandler implements ICommandHandler<CreateAppointmentCommand> {
  constructor(
    private readonly appointments: AppointmentRepository,   // ports (abstract classes), not Prisma
    private readonly resources: BookableResources,
    private readonly vehicles: VehicleOwnership,
    private readonly clock: Clock,
  ) {}

  @Transactional()
  async execute(cmd: CreateAppointmentCommand): Promise<{ id: string }> {
    await this.vehicles.assertOwnedBy(cmd.vehicleId, cmd.customerId);           // BR-5, BR-13
    const { dealership, serviceType, bays, qualifiedTechnicians } =
      await this.resources.load(cmd.dealershipId, cmd.serviceTypeId);          // BR-13
    const slot = TimeSlot.fromStartAndDuration(cmd.desiredStart, serviceType.durationMinutes); // BR-1

    const busy = await this.appointments.findConfirmedOverlapping(dealership.id, slot);
    const { bay, technician } = ResourceAllocator.allocate({                   // domain service: BR-6/7/8/11
      slot, bays, technicians: qualifiedTechnicians, busy,
    });

    const appointment = Appointment.create({                                   // BR-3, BR-4
      id: randomUUID(),
      customerId: cmd.customerId,
      vehicleId: cmd.vehicleId,
      serviceTypeId: serviceType.id,
      dealership,                       // carries opening hours + time zone
      bayId: bay.id,
      technicianId: technician.id,
      slot,
      now: this.clock.now(),
    });
    await this.appointments.save(appointment);                                // DB exclusion constraint: BR-10
    return { id: appointment.id };
  }
}
```

## Query handlers
- May use a dedicated read port (`AppointmentReadModel`) that returns views directly, skipping entities.
- Never write. Pagination follows `../conventions.md` › API (cursor).

## Transactions
- One command = one transaction, opened by `@Transactional()` on the handler's `execute`.
- Implementation: `@nestjs-cls/transactional` + Prisma adapter. Repositories use the transactional client from CLS, so they join automatically.
- Invariants that can race (double booking) must also be backed by a DB constraint or row lock. The in-memory check alone is not enough (see M2 and BR-10).

## Cross-cutting concerns (in place of MediatR pipeline behaviors)
`@nestjs/cqrs` has no pipeline behaviors, so:

| Concern | Where |
|---|---|
| Input shape validation | Presentation: DTO + global `ValidationPipe` |
| Business validation | Domain (entities/value objects/services), called from handlers |
| Transactions | `@Transactional()` on handlers |
| Logging, request id, timing | Nest interceptor + CLS request context |
| Error → HTTP mapping | `GlobalExceptionFilter` |
| Authorization (if the brief needs it) | Guards in presentation; ownership rules in handlers |

If more pipeline-style behaviour is needed later, wrap `CommandBus` in a small decorator service, and record that in an ADR first.

## Non-repository ports
External services (email, payments, other systems) get an `abstract class` port in `application/ports/` and an adapter in infrastructure. Only add one when the brief requires it.
