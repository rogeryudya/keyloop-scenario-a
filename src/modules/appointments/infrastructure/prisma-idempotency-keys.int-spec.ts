import { TransactionHost } from '@nestjs-cls/transactional';
import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { AppointmentConflictError } from '../domain/appointment.errors';
import { PrismaIdempotencyKeys } from './prisma-idempotency-keys';

const APPOINTMENT = '79000000-0000-4000-8000-000000000001';

describe('PrismaIdempotencyKeys (int)', () => {
  let context: INestApplicationContext;
  let prisma: PrismaService;
  let keys: PrismaIdempotencyKeys;

  const record = (key: string) => ({
    key,
    requestHash: 'a'.repeat(64),
    appointmentId: APPOINTMENT,
    createdAt: new Date('2030-01-14T00:00:00.000Z'),
  });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, TransactionsModule],
    }).compile();
    context = await moduleRef.init();
    prisma = context.get(PrismaService);
    keys = new PrismaIdempotencyKeys(context.get<PrismaTransactionHost>(TransactionHost));
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
      },
    });
  });

  beforeEach(async () => {
    await prisma.idempotencyKey.deleteMany();
  });

  afterAll(async () => {
    await resetDb(prisma);
    await context.close();
  });

  it('stores a key and finds it again', async () => {
    await keys.save(record('k-1'));

    await expect(keys.find('k-1')).resolves.toEqual(record('k-1'));
  });

  it('returns null for an unknown key', async () => {
    await expect(keys.find('never-used')).resolves.toBeNull();
  });

  it('rejects a second save of the same key as a lost race (retryable)', async () => {
    await keys.save(record('k-1'));

    await expect(keys.save(record('k-1'))).rejects.toThrow(AppointmentConflictError);
  });

  it('treats keys as case-sensitive', async () => {
    await keys.save(record('Key'));

    await expect(keys.find('key')).resolves.toBeNull();
  });
});
