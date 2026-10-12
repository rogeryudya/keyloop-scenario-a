import { TransactionHost } from '@nestjs-cls/transactional';
import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import data from '../../../../prisma/seed/data.json';
import { buildSeedPlan } from '../../../../prisma/seed/seed-plan';
import { writeSeed } from '../../../../prisma/seed/write-seed';
import { appointmentRepositoryContract } from '../../../../test/contracts/appointment-repository.contract';
import { resetDb } from '../../../../test/helpers/db';
import { AppConfigModule } from '../../../config/config.module';
import { TimeSlot } from '../../../shared/domain/time-slot';
import { PrismaModule } from '../../../shared/infrastructure/prisma/prisma.module';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  PrismaTransactionHost,
  TransactionsModule,
} from '../../../shared/infrastructure/prisma/transactions.module';
import { AppointmentStatus } from '../domain/appointment-status';
import { Appointment } from '../domain/appointment.entity';
import { AppointmentConflictError } from '../domain/appointment.errors';
import { PrismaAppointmentRepository } from './prisma-appointment.repository';

// Bangkok seed data: Anong and Boonsong are qualified for OIL_CHANGE.
const BANGKOK = '10000000-0000-4000-8000-000000000001';
const BAY_1 = '20000000-0000-4000-8000-000000000101';
const BAY_2 = '20000000-0000-4000-8000-000000000102';
const ANONG = '30000000-0000-4000-8000-000000000101';
const BOONSONG = '30000000-0000-4000-8000-000000000102';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001';

const anAppointment = (input: {
  start: string;
  bay?: string;
  technician?: string;
  dealership?: string;
}): Appointment =>
  Appointment.restore({
    id: randomUUID(),
    dealershipId: input.dealership ?? BANGKOK,
    serviceBayId: input.bay ?? BAY_1,
    technicianId: input.technician ?? ANONG,
    serviceTypeId: OIL_CHANGE,
    customerId: '50000000-0000-4000-8000-000000000001',
    vehicleId: '60000000-0000-4000-8000-000000000001',
    slot: TimeSlot.fromStartAndDuration(new Date(input.start), 60),
    status: AppointmentStatus.Confirmed,
    createdAt: new Date('2030-01-01T00:00:00.000Z'),
    cancelledAt: null,
  });

describe('PrismaAppointmentRepository (int)', () => {
  let context: INestApplicationContext;
  let prisma: PrismaService;
  let repository: PrismaAppointmentRepository;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, TransactionsModule],
    }).compile();
    context = await moduleRef.init();
    prisma = context.get(PrismaService);
    repository = new PrismaAppointmentRepository(
      context.get<PrismaTransactionHost>(TransactionHost),
    );
    await resetDb(prisma);
    await writeSeed(prisma, { ...buildSeedPlan(data, new Date()), appointments: [] });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await context.close();
  });

  describe('contract', () => {
    appointmentRepositoryContract(async () => {
      await prisma.appointment.deleteMany();
      return repository;
    });
  });

  describe('save conflicts (BR-10)', () => {
    beforeEach(async () => {
      await prisma.appointment.deleteMany();
    });

    it.each([
      ['bay', { technician: BOONSONG }],
      ['technician', { bay: BAY_2 }],
    ])('maps an exclusion violation on the %s to AppointmentConflictError', async (_r, other) => {
      await repository.save(anAppointment({ start: '2030-01-15T03:00:00.000Z' }));

      await expect(
        repository.save(anAppointment({ start: '2030-01-15T03:30:00.000Z', ...other })),
      ).rejects.toThrow(AppointmentConflictError);
    });

    it('lets other database errors through unchanged', async () => {
      const orphan = anAppointment({ start: '2030-01-15T03:00:00.000Z', dealership: randomUUID() });

      await expect(repository.save(orphan)).rejects.not.toThrow(AppointmentConflictError);
    });
  });
});
