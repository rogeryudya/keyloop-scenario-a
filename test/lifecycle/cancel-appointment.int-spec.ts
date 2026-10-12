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
import { ClockModule } from '../../src/shared/infrastructure/clock/clock.module';
import { PrismaModule } from '../../src/shared/infrastructure/prisma/prisma.module';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { TransactionsModule } from '../../src/shared/infrastructure/prisma/transactions.module';
import { AppointmentsModule } from '../../src/modules/appointments/appointments.module';
import { CancelAppointmentCommand } from '../../src/modules/appointments/application/commands/cancel-appointment/cancel-appointment.command';
import { CreateAppointmentCommand } from '../../src/modules/appointments/application/commands/create-appointment/create-appointment.command';
import { NoServiceBayAvailableError } from '../../src/modules/appointments/domain/appointment.errors';

// Seed data. Hanoi: 1 bay, 2 OIL_CHANGE technicians.
const HANOI = '10000000-0000-4000-8000-000000000003';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001';
const LAN = '50000000-0000-4000-8000-000000000004';
const LAN_CAR = '60000000-0000-4000-8000-000000000005';

const NOW = '2030-01-14T00:00:00.000Z';
const START = new Date('2030-01-15T10:00:00+07:00');

/** FR-8 + BR-9 against real Postgres: the exclusion constraint must ignore cancelled rows. */
describe('CancelAppointment frees the slot (int)', () => {
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

  const book = () =>
    commands.execute(new CreateAppointmentCommand(LAN, LAN_CAR, HANOI, OIL_CHANGE, START));

  it('persists the cancellation', async () => {
    const { id } = await book();

    await commands.execute(new CancelAppointmentCommand(id));

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe('CANCELLED');
    expect(row.cancelledAt).toEqual(new Date(NOW));
  });

  it('lets the same bay and technician be booked again for the same time', async () => {
    const first = await book();
    await expect(book()).rejects.toThrow(NoServiceBayAvailableError); // the only bay is taken

    await commands.execute(new CancelAppointmentCommand(first.id));
    const second = await book();

    const [cancelled, rebooked] = await Promise.all([
      prisma.appointment.findUniqueOrThrow({ where: { id: first.id } }),
      prisma.appointment.findUniqueOrThrow({ where: { id: second.id } }),
    ]);
    expect(rebooked).toMatchObject({
      status: 'CONFIRMED',
      serviceBayId: cancelled.serviceBayId,
      technicianId: cancelled.technicianId, // least loaded again: cancelled ones don't count
      startAt: cancelled.startAt,
    });
  });
});
