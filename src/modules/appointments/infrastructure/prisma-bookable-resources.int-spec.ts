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
import { PrismaBookableResources } from './prisma-bookable-resources';

const BANGKOK = '10000000-0000-4000-8000-000000000001';
const HANOI = '10000000-0000-4000-8000-000000000003';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001';
const TRANSMISSION_REPAIR = '40000000-0000-4000-8000-000000000007';

describe('PrismaBookableResources (int)', () => {
  let context: INestApplicationContext;
  let prisma: PrismaService;
  let resources: PrismaBookableResources;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, TransactionsModule],
    }).compile();
    context = await moduleRef.init();
    prisma = context.get(PrismaService);
    resources = new PrismaBookableResources(context.get<PrismaTransactionHost>(TransactionHost));
    await resetDb(prisma);
    await writeSeed(prisma, { ...buildSeedPlan(data, new Date()), appointments: [] });
  });

  afterAll(async () => {
    await resetDb(prisma);
    await context.close();
  });

  describe('findDealership', () => {
    it('returns the dealership with its opening hours in its time zone', async () => {
      const dealership = await resources.findDealership(BANGKOK);

      expect(dealership?.id).toBe(BANGKOK);
      expect(dealership?.openingHours).toMatchObject({
        opensAt: '08:00',
        closesAt: '18:00',
        timeZone: 'Asia/Bangkok',
      });
    });

    it('returns null for an unknown id', async () => {
      await expect(resources.findDealership(randomUUID())).resolves.toBeNull();
    });
  });

  describe('findServiceType', () => {
    it('returns the id and duration', async () => {
      await expect(resources.findServiceType(OIL_CHANGE)).resolves.toEqual({
        id: OIL_CHANGE,
        durationMinutes: 30,
      });
    });

    it('returns null for an unknown id', async () => {
      await expect(resources.findServiceType(randomUUID())).resolves.toBeNull();
    });
  });

  describe('findCandidates', () => {
    it("returns the dealership's bays and only its technicians qualified for the service", async () => {
      const { bays, technicians } = await resources.findCandidates(BANGKOK, OIL_CHANGE);

      expect(bays).toEqual([
        { id: '20000000-0000-4000-8000-000000000101', dealershipId: BANGKOK },
        { id: '20000000-0000-4000-8000-000000000102', dealershipId: BANGKOK },
        { id: '20000000-0000-4000-8000-000000000103', dealershipId: BANGKOK },
      ]);
      expect(technicians).toEqual([
        {
          id: '30000000-0000-4000-8000-000000000101',
          dealershipId: BANGKOK,
          serviceTypeIds: [OIL_CHANGE],
        },
        {
          id: '30000000-0000-4000-8000-000000000102',
          dealershipId: BANGKOK,
          serviceTypeIds: [OIL_CHANGE],
        },
      ]);
    });

    it('returns no technicians when nobody there is qualified (BR-6)', async () => {
      const { bays, technicians } = await resources.findCandidates(HANOI, TRANSMISSION_REPAIR);

      expect(bays).toHaveLength(1);
      expect(technicians).toEqual([]);
    });

    it('returns nothing for an unknown dealership', async () => {
      await expect(resources.findCandidates(randomUUID(), OIL_CHANGE)).resolves.toEqual({
        bays: [],
        technicians: [],
      });
    });
  });
});
