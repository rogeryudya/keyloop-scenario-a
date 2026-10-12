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
import { PrismaDealershipReadModel } from './prisma-dealership-read-model';

const BANGKOK = '10000000-0000-4000-8000-000000000001';
const HCMC = '10000000-0000-4000-8000-000000000002';
const HANOI = '10000000-0000-4000-8000-000000000003';

describe('PrismaDealershipReadModel (int)', () => {
  let context: INestApplicationContext;
  let prisma: PrismaService;
  let readModel: PrismaDealershipReadModel;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, TransactionsModule],
    }).compile();
    context = await moduleRef.init();
    prisma = context.get(PrismaService);
    readModel = new PrismaDealershipReadModel(context.get<PrismaTransactionHost>(TransactionHost));
    await resetDb(prisma);
    // One transaction: every row gets the same created_at, so ordering falls back to id DESC.
    await writeSeed(prisma, buildSeedPlan(data, new Date()));
  });

  afterAll(async () => {
    await resetDb(prisma);
    await context.close();
  });

  describe('listDealerships', () => {
    it('returns dealerships newest first, id DESC as tiebreaker, with HH:mm opening hours', async () => {
      const rows = await readModel.listDealerships({ take: 10 });

      expect(rows.map((d) => d.id)).toEqual([HANOI, HCMC, BANGKOK]);
      expect(rows[2]).toMatchObject({
        name: 'Keyloop Motors Bangkok',
        timeZone: 'Asia/Bangkok',
        opensAt: '08:00',
        closesAt: '18:00',
      });
    });

    it('limits with take and continues strictly after the given position', async () => {
      const [first] = await readModel.listDealerships({ take: 1 });
      if (!first) throw new Error('seeded');

      const rest = await readModel.listDealerships({ after: first, take: 10 });

      expect(rest.map((d) => d.id)).toEqual([HCMC, BANGKOK]);
    });

    it('orders by createdAt before id', async () => {
      await prisma.dealership.update({
        where: { id: BANGKOK },
        data: { createdAt: new Date('2099-01-01T00:00:00.000Z') },
      });

      const rows = await readModel.listDealerships({ take: 10 });

      expect(rows.map((d) => d.id)).toEqual([BANGKOK, HANOI, HCMC]);
      await prisma.dealership.update({
        where: { id: BANGKOK },
        data: { createdAt: rows[1]?.createdAt ?? new Date() },
      });
    });
  });

  describe('findDealership', () => {
    it("derives supported service types from the technicians' qualifications", async () => {
      const hanoi = await readModel.findDealership(HANOI);

      // Pham Thu Ha: OIL_CHANGE, TYRE_ROTATION; Vu Duc Khoa: OIL_CHANGE, BRAKE_SERVICE, DIAGNOSTICS.
      expect(hanoi).toMatchObject({ id: HANOI, opensAt: '09:00', closesAt: '17:00' });
      expect(hanoi?.supportedServiceTypeIds).toEqual([
        '40000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000002',
        '40000000-0000-4000-8000-000000000003',
        '40000000-0000-4000-8000-000000000006',
      ]);
    });

    it('returns null for an unknown id', async () => {
      expect(await readModel.findDealership('10000000-0000-4000-8000-000000000099')).toBeNull();
    });
  });

  describe('listServiceTypes', () => {
    it('pages through all service types with keyset positions', async () => {
      const first = await readModel.listServiceTypes({ take: 4 });
      const last = first.at(-1);
      if (!last) throw new Error('seeded');
      const second = await readModel.listServiceTypes({ after: last, take: 4 });

      expect([...first, ...second].map((s) => s.code)).toEqual([
        'TRANSMISSION_REPAIR',
        'DIAGNOSTICS',
        'EV_BATTERY_CHECK',
        'ANNUAL_SERVICE',
        'BRAKE_SERVICE',
        'TYRE_ROTATION',
        'OIL_CHANGE',
      ]);
      expect(first[0]).toMatchObject({
        id: '40000000-0000-4000-8000-000000000007',
        code: 'TRANSMISSION_REPAIR',
        name: 'Transmission repair',
        durationMinutes: 180,
      });
      expect(first[0]?.createdAt).toBeInstanceOf(Date);
    });
  });
});
