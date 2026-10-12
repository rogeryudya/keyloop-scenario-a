import { TransactionHost } from '@nestjs-cls/transactional';
import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import data from '../../../../prisma/seed/data.json';
import { buildSeedPlan } from '../../../../prisma/seed/seed-plan';
import { writeSeed } from '../../../../prisma/seed/write-seed';
import { resetDb } from '../../../../test/helpers/db';
import { AppConfigModule } from '../../../config/config.module';
import { PrismaModule } from '../../../shared/infrastructure/prisma/prisma.module';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  PrismaTransactionHost,
  TransactionsModule,
} from '../../../shared/infrastructure/prisma/transactions.module';
import { AppointmentStatus } from '../domain/appointment-status';
import { PrismaAppointmentReadModel } from './prisma-appointment-read-model';

const APPOINTMENT = '79000000-0000-4000-8000-000000000001';

describe('PrismaAppointmentReadModel (int)', () => {
  let context: INestApplicationContext;
  let prisma: PrismaService;
  let readModel: PrismaAppointmentReadModel;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, TransactionsModule],
    }).compile();
    context = await moduleRef.init();
    prisma = context.get(PrismaService);
    readModel = new PrismaAppointmentReadModel(context.get<PrismaTransactionHost>(TransactionHost));
    await resetDb(prisma);
    await writeSeed(prisma, { ...buildSeedPlan(data, new Date()), appointments: [] });
    await prisma.appointment.create({
      data: {
        id: APPOINTMENT,
        dealershipId: '10000000-0000-4000-8000-000000000001',
        serviceBayId: '20000000-0000-4000-8000-000000000101',
        technicianId: '30000000-0000-4000-8000-000000000101',
        serviceTypeId: '40000000-0000-4000-8000-000000000001',
        customerId: '50000000-0000-4000-8000-000000000001',
        vehicleId: '60000000-0000-4000-8000-000000000001',
        startAt: new Date('2030-01-15T03:00:00.000Z'),
        endAt: new Date('2030-01-15T03:30:00.000Z'),
        createdAt: new Date('2030-01-01T00:00:00.000Z'),
      },
    });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await context.close();
  });

  it('returns the appointment with ids and names of everything it links', async () => {
    await expect(readModel.findById(APPOINTMENT)).resolves.toEqual({
      id: APPOINTMENT,
      status: AppointmentStatus.Confirmed,
      start: new Date('2030-01-15T03:00:00.000Z'),
      end: new Date('2030-01-15T03:30:00.000Z'),
      createdAt: new Date('2030-01-01T00:00:00.000Z'),
      cancelledAt: null,
      dealership: {
        id: '10000000-0000-4000-8000-000000000001',
        name: 'Keyloop Motors Bangkok',
        timeZone: 'Asia/Bangkok',
      },
      serviceBay: { id: '20000000-0000-4000-8000-000000000101', name: 'Bay 1' },
      technician: { id: '30000000-0000-4000-8000-000000000101', name: 'Anong Srisuk' },
      serviceType: {
        id: '40000000-0000-4000-8000-000000000001',
        code: 'OIL_CHANGE',
        name: 'Oil and filter change',
        durationMinutes: 30,
      },
      customer: { id: '50000000-0000-4000-8000-000000000001', name: 'Somsak Jaidee' },
      vehicle: {
        id: '60000000-0000-4000-8000-000000000001',
        registration: '1กข 2345',
        make: 'Toyota',
        model: 'Corolla Altis',
      },
    });
  });

  it('returns null for an unknown id', async () => {
    await expect(readModel.findById(randomUUID())).resolves.toBeNull();
  });
});
