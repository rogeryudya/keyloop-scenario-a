import { TransactionHost } from '@nestjs-cls/transactional';
import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import data from '../../../../prisma/seed/data.json';
import { buildSeedPlan } from '../../../../prisma/seed/seed-plan';
import { writeSeed } from '../../../../prisma/seed/write-seed';
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

// Seed reference data (prisma/seed/data.json). Anong and Boonsong are qualified for OIL_CHANGE.
const BANGKOK = '10000000-0000-4000-8000-000000000001';
const HCMC = '10000000-0000-4000-8000-000000000002';
const BAY_1 = '20000000-0000-4000-8000-000000000101';
const BAY_2 = '20000000-0000-4000-8000-000000000102';
const HCMC_BAY_A = '20000000-0000-4000-8000-000000000201';
const ANONG = '30000000-0000-4000-8000-000000000101';
const BOONSONG = '30000000-0000-4000-8000-000000000102';
const NGUYEN = '30000000-0000-4000-8000-000000000201';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001';
const SOMSAK = {
  customerId: '50000000-0000-4000-8000-000000000001',
  vehicleId: '60000000-0000-4000-8000-000000000001',
};
const LAN = {
  customerId: '50000000-0000-4000-8000-000000000004',
  vehicleId: '60000000-0000-4000-8000-000000000005',
};

const BOOKED_AT = new Date('2030-01-01T00:00:00.000Z');

/** Built with `restore`: these tests place slots at day edges, outside opening hours on purpose. */
const anAppointment = (input: {
  start: string;
  minutes?: number;
  bay?: string;
  technician?: string;
  dealership?: string;
  who?: typeof SOMSAK;
}): Appointment =>
  Appointment.restore({
    id: randomUUID(),
    dealershipId: input.dealership ?? BANGKOK,
    serviceBayId: input.bay ?? BAY_1,
    technicianId: input.technician ?? ANONG,
    serviceTypeId: OIL_CHANGE,
    ...(input.who ?? SOMSAK),
    slot: TimeSlot.fromStartAndDuration(new Date(input.start), input.minutes ?? 60),
    status: AppointmentStatus.Confirmed,
    createdAt: BOOKED_AT,
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

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
  });

  afterAll(async () => {
    await resetDb(prisma);
    await context.close();
  });

  describe('save and findById', () => {
    it('stores a new appointment and loads it back unchanged', async () => {
      const appointment = anAppointment({ start: '2030-01-15T03:00:00.000Z' });

      await repository.save(appointment);

      const loaded = await repository.findById(appointment.id);
      expect(loaded?.toSnapshot()).toEqual(appointment.toSnapshot());
    });

    it('returns null for an unknown id', async () => {
      await expect(repository.findById(randomUUID())).resolves.toBeNull();
    });

    it('updates the status of an existing appointment', async () => {
      const appointment = anAppointment({ start: '2030-01-15T03:00:00.000Z' });
      await repository.save(appointment);
      const cancelledAt = new Date('2030-01-02T00:00:00.000Z');

      appointment.cancel(cancelledAt);
      await repository.save(appointment);

      const loaded = await repository.findById(appointment.id);
      expect(loaded?.status).toBe(AppointmentStatus.Cancelled);
      expect(loaded?.toSnapshot().cancelledAt).toEqual(cancelledAt);
    });
  });

  describe('save conflicts (BR-10)', () => {
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

  describe('findConfirmedOverlapping', () => {
    const requested = TimeSlot.of(
      new Date('2030-01-15T03:00:00.000Z'),
      new Date('2030-01-15T04:00:00.000Z'),
    );

    it('returns confirmed appointments of the dealership that overlap, ordered by start', async () => {
      const later = anAppointment({ start: '2030-01-15T03:59:00.000Z', bay: BAY_2 });
      const earlier = anAppointment({ start: '2030-01-15T02:30:00.000Z', technician: BOONSONG });
      await repository.save(later);
      await repository.save(earlier);

      const found = await repository.findConfirmedOverlapping(BANGKOK, requested);

      expect(found.map((a) => a.id)).toEqual([earlier.id, later.id]);
    });

    it('excludes back-to-back appointments (BR-2)', async () => {
      await repository.save(anAppointment({ start: '2030-01-15T02:00:00.000Z' }));
      await repository.save(anAppointment({ start: '2030-01-15T04:00:00.000Z' }));

      await expect(repository.findConfirmedOverlapping(BANGKOK, requested)).resolves.toEqual([]);
    });

    it('excludes cancelled appointments (BR-9)', async () => {
      const appointment = anAppointment({ start: '2030-01-15T03:00:00.000Z' });
      appointment.cancel(BOOKED_AT);
      await repository.save(appointment);

      await expect(repository.findConfirmedOverlapping(BANGKOK, requested)).resolves.toEqual([]);
    });

    it('excludes appointments of another dealership', async () => {
      await repository.save(
        anAppointment({
          start: '2030-01-15T03:00:00.000Z',
          dealership: HCMC,
          bay: HCMC_BAY_A,
          technician: NGUYEN,
          who: LAN,
        }),
      );

      await expect(repository.findConfirmedOverlapping(BANGKOK, requested)).resolves.toEqual([]);
    });
  });

  describe('countForTechniciansOnDay', () => {
    it('counts confirmed appointments starting on the local day (Asia/Bangkok, UTC+7)', async () => {
      // Local day 2030-01-15 in Bangkok = [2030-01-14T17:00Z, 2030-01-15T17:00Z).
      await repository.save(anAppointment({ start: '2030-01-14T17:00:00.000Z' })); // 00:00 local
      await repository.save(anAppointment({ start: '2030-01-15T16:30:00.000Z', minutes: 30 })); // 23:30
      await repository.save(anAppointment({ start: '2030-01-14T16:00:00.000Z' })); // previous day
      await repository.save(anAppointment({ start: '2030-01-15T17:00:00.000Z' })); // next day
      await repository.save(
        anAppointment({ start: '2030-01-15T03:00:00.000Z', technician: BOONSONG }),
      );
      const cancelled = anAppointment({ start: '2030-01-15T05:00:00.000Z', technician: BOONSONG });
      cancelled.cancel(BOOKED_AT);
      await repository.save(cancelled);

      const counts = await repository.countForTechniciansOnDay(
        [ANONG, BOONSONG],
        new Date('2030-01-15T03:00:00.000Z'),
        'Asia/Bangkok',
      );

      expect(counts).toEqual(
        new Map([
          [ANONG, 2],
          [BOONSONG, 1],
        ]),
      );
    });

    it('uses the zone rules on a DST day (Europe/London, 23-hour day)', async () => {
      // 2030-03-31 is the spring-forward day in London: local day = [00:00Z, 23:00Z).
      await repository.save(anAppointment({ start: '2030-03-31T22:00:00.000Z' })); // 23:00 BST
      await repository.save(anAppointment({ start: '2030-03-31T23:00:00.000Z' })); // 00:00 next day

      const counts = await repository.countForTechniciansOnDay(
        [ANONG],
        new Date('2030-03-31T12:00:00.000Z'),
        'Europe/London',
      );

      expect(counts).toEqual(new Map([[ANONG, 1]]));
    });

    it('omits technicians with no appointments and only counts the requested ones', async () => {
      await repository.save(anAppointment({ start: '2030-01-15T03:00:00.000Z' }));

      const counts = await repository.countForTechniciansOnDay(
        [BOONSONG],
        new Date('2030-01-15T03:00:00.000Z'),
        'Asia/Bangkok',
      );

      expect(counts).toEqual(new Map());
    });

    it('returns an empty map for no technicians', async () => {
      await expect(
        repository.countForTechniciansOnDay([], new Date(), 'Asia/Bangkok'),
      ).resolves.toEqual(new Map());
    });
  });
});
