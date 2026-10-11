# Infrastructure layer

Implements the ports. The only layer that knows Prisma, the DB schema or external SDKs.

## Repository adapters
- `PrismaAppointmentRepository extends AppointmentRepository`. Extending the abstract class keeps it usable as the DI token.
- Gets the Prisma client from the transaction host (`TransactionHost<TransactionalAdapterPrisma>`), so it joins the active transaction automatically. Repositories never inject `PrismaService` directly.
- Takes and returns **domain entities**, converting via the mapper.
- Translates persistence failures into domain errors where they carry business meaning (e.g. Prisma `P2002` unique violation on an appointment slot → `AppointmentConflictError`). Everything else bubbles up as-is and becomes a 500.

```ts
@Injectable()
export class PrismaAppointmentRepository extends AppointmentRepository {
  constructor(private readonly txHost: TransactionHost<TransactionalAdapterPrisma>) { super(); }

  async findById(id: string): Promise<Appointment | null> {
    const row = await this.txHost.tx.appointment.findUnique({ where: { id } });
    return row ? AppointmentMapper.toDomain(row) : null;
  }

  async save(appointment: Appointment): Promise<void> {
    const data = AppointmentMapper.toPersistence(appointment);
    await this.txHost.tx.appointment.upsert({ where: { id: data.id }, create: data, update: data });
  }
}
```

## Mappers
- `AppointmentMapper.toDomain(row)` calls `Appointment.restore(...)`. `AppointmentMapper.toPersistence(entity)` returns the Prisma input.
- Pure static functions, unit-testable. Prisma types never leave this folder.

## Module wiring
```ts
@Module({
  controllers: [AppointmentController],
  providers: [
    CreateAppointmentHandler,
    GetAppointmentHandler,
    { provide: AppointmentRepository, useClass: PrismaAppointmentRepository },
  ],
})
export class AppointmentModule {}
```

## Data / Prisma
Full schema reference: [../data-dictionary.md](../data-dictionary.md).
- Postgres via Prisma. Schema changes only through migrations (`prisma migrate dev --name <change>`). Never edit an applied migration.
- Enforce invariants in the DB too: unique, FK and check constraints, and exclusion constraints for overlaps (raw SQL in a migration if Prisma can't express it).
- Models are `PascalCase` singular; tables are `snake_case` plural via `@@map`; columns via `@map`.
- UUID primary keys; `createdAt`/`updatedAt` on every table; timestamps stored in UTC (`timestamptz`).
- Index every FK and the columns used for cursor ordering (`createdAt, id`).
- The Prisma schema is not the domain model. Persistence shape may differ; the mapper bridges them.

## Configuration
- All config comes from env vars, validated at startup (fail fast) through a typed config service in `src/config`, and documented in `.env.example`.
- DB credentials: `DbCredentialsProvider` reads the RDS-format secret from Secrets Manager (`DB_SECRET_ID`), or uses `DATABASE_URL` (tests only). Details: `../local-dev/aws-emulation.md`.
- Nothing reads `process.env` outside `src/config`.

## Other adapters
- `SystemClock extends Clock` in `shared/infrastructure/clock`.
- External service adapters (if any) live in their module's `infrastructure/`, with timeouts, and translate failures into domain/application errors.
