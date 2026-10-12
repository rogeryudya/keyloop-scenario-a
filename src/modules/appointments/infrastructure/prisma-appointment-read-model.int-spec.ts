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

  describe('list (FR-9)', () => {
    // With APPOINTMENT (Bangkok, Somsak, created 01-01) from the outer beforeAll:
    const BANGKOK = '10000000-0000-4000-8000-000000000001';
    const HANOI = '10000000-0000-4000-8000-000000000003';
    const SOMSAK = '50000000-0000-4000-8000-000000000001';
    const MALEE_IN_BANGKOK = '79000000-0000-4000-8000-000000000002'; // created 01-02
    const SOMSAK_CANCELLED = '79000000-0000-4000-8000-000000000003'; // created 01-03, starts 16th
    const SOMSAK_IN_HANOI = '79000000-0000-4000-8000-000000000004'; // created 01-03

    const row = (input: {
      id: string;
      dealershipId: string;
      bay: string;
      technician: string;
      customerId: string;
      vehicleId: string;
      startAt: string;
      createdAt: string;
      cancelled?: boolean;
    }) => ({
      id: input.id,
      dealershipId: input.dealershipId,
      serviceBayId: input.bay,
      technicianId: input.technician,
      serviceTypeId: '40000000-0000-4000-8000-000000000001',
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      startAt: new Date(input.startAt),
      endAt: new Date(new Date(input.startAt).getTime() + 30 * 60_000),
      createdAt: new Date(input.createdAt),
      ...(input.cancelled && {
        status: 'CANCELLED' as const,
        cancelledAt: new Date(input.createdAt),
      }),
    });

    beforeAll(async () => {
      await prisma.appointment.createMany({
        data: [
          row({
            id: MALEE_IN_BANGKOK,
            dealershipId: BANGKOK,
            bay: '20000000-0000-4000-8000-000000000102',
            technician: '30000000-0000-4000-8000-000000000102',
            customerId: '50000000-0000-4000-8000-000000000002',
            vehicleId: '60000000-0000-4000-8000-000000000003',
            startAt: '2030-01-15T03:00:00.000Z',
            createdAt: '2030-01-02T00:00:00.000Z',
          }),
          row({
            id: SOMSAK_CANCELLED,
            dealershipId: BANGKOK,
            bay: '20000000-0000-4000-8000-000000000101',
            technician: '30000000-0000-4000-8000-000000000101',
            customerId: SOMSAK,
            vehicleId: '60000000-0000-4000-8000-000000000001',
            startAt: '2030-01-16T03:00:00.000Z',
            createdAt: '2030-01-03T00:00:00.000Z',
            cancelled: true,
          }),
          row({
            id: SOMSAK_IN_HANOI,
            dealershipId: HANOI,
            bay: '20000000-0000-4000-8000-000000000301',
            technician: '30000000-0000-4000-8000-000000000301',
            customerId: SOMSAK,
            vehicleId: '60000000-0000-4000-8000-000000000002',
            startAt: '2030-01-15T03:00:00.000Z',
            createdAt: '2030-01-03T00:00:00.000Z',
          }),
        ],
      });
    });

    const ids = async (
      filter: Parameters<PrismaAppointmentReadModel['list']>[0],
      slice: Parameters<PrismaAppointmentReadModel['list']>[1] = { take: 10 },
    ) => (await readModel.list(filter, slice)).map((v) => v.id);

    it("lists a dealership's appointments, cancelled included, newest first", async () => {
      await expect(ids({ dealershipId: BANGKOK })).resolves.toEqual([
        SOMSAK_CANCELLED,
        MALEE_IN_BANGKOK,
        APPOINTMENT,
      ]);
    });

    it("lists a customer's appointments across dealerships; equal createdAt → id DESC", async () => {
      await expect(ids({ customerId: SOMSAK })).resolves.toEqual([
        SOMSAK_IN_HANOI,
        SOMSAK_CANCELLED,
        APPOINTMENT,
      ]);
    });

    it('applies both filters together', async () => {
      await expect(ids({ dealershipId: BANGKOK, customerId: SOMSAK })).resolves.toEqual([
        SOMSAK_CANCELLED,
        APPOINTMENT,
      ]);
    });

    it('filters by start in [startFrom, startBefore)', async () => {
      const filter = {
        dealershipId: BANGKOK,
        startFrom: new Date('2030-01-15T03:00:00.000Z'),
        startBefore: new Date('2030-01-16T03:00:00.000Z'),
      };

      await expect(ids(filter)).resolves.toEqual([MALEE_IN_BANGKOK, APPOINTMENT]);
    });

    it('returns rows strictly after the cursor position', async () => {
      const after = { createdAt: new Date('2030-01-02T00:00:00.000Z'), id: MALEE_IN_BANGKOK };

      await expect(ids({ dealershipId: BANGKOK }, { take: 10, after })).resolves.toEqual([
        APPOINTMENT,
      ]);
      await expect(ids({ dealershipId: BANGKOK }, { take: 1 })).resolves.toEqual([
        SOMSAK_CANCELLED,
      ]);
    });

    it('maps linked names and status like findById', async () => {
      const [first] = await readModel.list({ dealershipId: BANGKOK }, { take: 1 });

      expect(first).toEqual(await readModel.findById(SOMSAK_CANCELLED));
      expect(first?.status).toBe(AppointmentStatus.Cancelled);
    });
  });
});
