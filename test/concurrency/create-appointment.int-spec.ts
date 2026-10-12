import { INestApplicationContext } from '@nestjs/common';
import { CommandBus, CqrsModule } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import data from '../../prisma/seed/data.json';
import { buildSeedPlan } from '../../prisma/seed/seed-plan';
import { writeSeed } from '../../prisma/seed/write-seed';
import { FixedClock } from '../fakes/fixed-clock';
import { resetDb } from '../helpers/db';
import { AppConfigModule } from '../../src/config/config.module';
import { Clock } from '../../src/shared/domain/clock';
import { ConflictError } from '../../src/shared/domain/errors';
import { ClockModule } from '../../src/shared/infrastructure/clock/clock.module';
import { PrismaModule } from '../../src/shared/infrastructure/prisma/prisma.module';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { TransactionsModule } from '../../src/shared/infrastructure/prisma/transactions.module';
import { AppointmentsModule } from '../../src/modules/appointments/appointments.module';
import { CreateAppointmentCommand } from '../../src/modules/appointments/application/commands/create-appointment/create-appointment.command';

// Seed data. Hanoi: 1 bay, 2 OIL_CHANGE technicians. HCMC: 2 bays, 2 OIL_CHANGE technicians.
const HANOI = '10000000-0000-4000-8000-000000000003';
const HCMC = '10000000-0000-4000-8000-000000000002';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001';
const LAN = '50000000-0000-4000-8000-000000000004';
const LAN_CAR = '60000000-0000-4000-8000-000000000005';

const PARALLEL = 10;
const NOW = '2030-01-14T00:00:00.000Z';
const START = new Date('2030-01-15T10:00:00+07:00'); // within both dealerships' hours

/**
 * NFR-6 / BR-10: real handler + Prisma + Postgres, so this proves the exclusion constraint and the
 * retry, not just the in-memory check.
 */
describe('CreateAppointment under concurrency (int)', () => {
  let context: INestApplicationContext;
  let prisma: PrismaService;
  let commands: CommandBus;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppConfigModule,
        PrismaModule,
        TransactionsModule,
        ClockModule,
        CqrsModule.forRoot(),
        AppointmentsModule,
      ],
    })
      .overrideProvider(Clock)
      .useValue(new FixedClock(NOW))
      .compile();
    context = await moduleRef.init();
    prisma = context.get(PrismaService);
    commands = context.get(CommandBus);
    await resetDb(prisma);
    await writeSeed(prisma, { ...buildSeedPlan(data, new Date(NOW)), appointments: [] });
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
  });

  afterAll(async () => {
    await resetDb(prisma);
    await context.close();
  });

  const bookInParallel = (dealershipId: string) =>
    Promise.allSettled(
      Array.from({ length: PARALLEL }, () =>
        commands.execute(
          new CreateAppointmentCommand(LAN, LAN_CAR, dealershipId, OIL_CHANGE, START),
        ),
      ),
    );

  const split = (results: PromiseSettledResult<{ id: string }>[]) => ({
    booked: results.filter((r) => r.status === 'fulfilled'),
    failed: results.filter((r) => r.status === 'rejected').map((r) => r.reason as unknown),
  });

  it(`books exactly one of ${PARALLEL} parallel requests when there is one bay`, async () => {
    const { booked, failed } = split(await bookInParallel(HANOI));

    expect(booked).toHaveLength(1);
    expect(failed).toHaveLength(PARALLEL - 1);
    for (const error of failed) expect(error).toBeInstanceOf(ConflictError); // 409
    expect(await prisma.appointment.count({ where: { dealershipId: HANOI } })).toBe(1);
  });

  it(`books exactly two of ${PARALLEL} with two bays and two qualified technicians`, async () => {
    const { booked, failed } = split(await bookInParallel(HCMC));

    expect(booked).toHaveLength(2);
    for (const error of failed) expect(error).toBeInstanceOf(ConflictError);
    const rows = await prisma.appointment.findMany({ where: { dealershipId: HCMC } });
    expect(new Set(rows.map((r) => r.serviceBayId)).size).toBe(2);
    expect(new Set(rows.map((r) => r.technicianId)).size).toBe(2);
  });

  it(`creates one appointment for ${PARALLEL} parallel requests with the same Idempotency-Key (FR-11)`, async () => {
    // HCMC has two free bays: without the key, two of these would book.
    const results = await Promise.allSettled(
      Array.from({ length: PARALLEL }, () =>
        commands.execute(
          new CreateAppointmentCommand(LAN, LAN_CAR, HCMC, OIL_CHANGE, START, 'same-key'),
        ),
      ),
    );

    const { booked } = split(results);
    const ids = new Set(booked.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    expect(await prisma.appointment.count({ where: { dealershipId: HCMC } })).toBe(1);
    expect(await prisma.idempotencyKey.count()).toBe(1);
    expect(ids.size).toBe(1); // every request that succeeded got the same appointment
    expect(booked).toHaveLength(PARALLEL); // the losers replay the winner
  });
});
