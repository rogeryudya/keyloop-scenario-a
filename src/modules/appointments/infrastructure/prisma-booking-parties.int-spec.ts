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
import { PrismaBookingParties } from './prisma-booking-parties';

const SOMSAK = '50000000-0000-4000-8000-000000000001';
const SOMSAK_TESLA = '60000000-0000-4000-8000-000000000002';

describe('PrismaBookingParties (int)', () => {
  let context: INestApplicationContext;
  let prisma: PrismaService;
  let parties: PrismaBookingParties;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, TransactionsModule],
    }).compile();
    context = await moduleRef.init();
    prisma = context.get(PrismaService);
    parties = new PrismaBookingParties(context.get<PrismaTransactionHost>(TransactionHost));
    await resetDb(prisma);
    await writeSeed(prisma, { ...buildSeedPlan(data, new Date()), appointments: [] });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await context.close();
  });

  it('reports whether a customer exists', async () => {
    await expect(parties.customerExists(SOMSAK)).resolves.toBe(true);
    await expect(parties.customerExists(randomUUID())).resolves.toBe(false);
  });

  it("returns a vehicle's owner, or null for an unknown vehicle", async () => {
    await expect(parties.findVehicleOwnerId(SOMSAK_TESLA)).resolves.toBe(SOMSAK);
    await expect(parties.findVehicleOwnerId(randomUUID())).resolves.toBeNull();
  });
});
