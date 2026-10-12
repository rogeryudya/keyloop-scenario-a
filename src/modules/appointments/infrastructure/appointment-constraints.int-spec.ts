import data from '../../../../prisma/seed/data.json';
import { buildSeedPlan } from '../../../../prisma/seed/seed-plan';
import { writeSeed } from '../../../../prisma/seed/write-seed';
import { resetDb } from '../../../../test/helpers/db';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';

// Bangkok reference data from data.json. Anong and Boonsong are both qualified for OIL_CHANGE.
const BANGKOK = '10000000-0000-4000-8000-000000000001';
const BAY_1 = '20000000-0000-4000-8000-000000000101';
const BAY_2 = '20000000-0000-4000-8000-000000000102';
const ANONG = '30000000-0000-4000-8000-000000000101';
const BOONSONG = '30000000-0000-4000-8000-000000000102';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001';
const SOMSAK = {
  customerId: '50000000-0000-4000-8000-000000000001',
  vehicleId: '60000000-0000-4000-8000-000000000001',
};
const MALEE = {
  customerId: '50000000-0000-4000-8000-000000000002',
  vehicleId: '60000000-0000-4000-8000-000000000003',
};

const at = (hhmm: string): Date => new Date(`2030-01-15T${hhmm}:00.000Z`);

describe('appointments exclusion constraints (int, BR-2, BR-9, BR-10)', () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) throw new Error('DATABASE_URL is set by globalSetup');
  const prisma = new PrismaService(databaseUrl);
  let seq = 0;

  const insert = (input: {
    bay: string;
    technician: string;
    from: string;
    to: string;
    status?: 'CONFIRMED' | 'CANCELLED';
    who?: typeof SOMSAK;
  }): Promise<unknown> => {
    seq += 1;
    const cancelled = input.status === 'CANCELLED';
    return prisma.appointment.create({
      data: {
        id: `79000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
        dealershipId: BANGKOK,
        serviceBayId: input.bay,
        technicianId: input.technician,
        serviceTypeId: OIL_CHANGE,
        ...(input.who ?? SOMSAK),
        startAt: at(input.from),
        endAt: at(input.to),
        status: input.status ?? 'CONFIRMED',
        cancelledAt: cancelled ? at('00:00') : null,
      },
    });
  };

  beforeAll(async () => {
    await resetDb(prisma);
    const plan = buildSeedPlan(data, new Date());
    await writeSeed(prisma, { ...plan, appointments: [] });
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
  });

  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  describe('same bay, different technicians', () => {
    it.each([
      ['identical', '10:00', '11:00'],
      ['partial at the start', '09:30', '10:30'],
      ['partial at the end', '10:59', '11:30'],
      ['enclosed', '10:15', '10:45'],
      ['enclosing', '09:00', '12:00'],
    ])('rejects an overlapping CONFIRMED appointment (%s)', async (_case, from, to) => {
      await insert({ bay: BAY_1, technician: ANONG, from: '10:00', to: '11:00' });

      await expect(
        insert({ bay: BAY_1, technician: BOONSONG, from, to, who: MALEE }),
      ).rejects.toThrow(/appointments_no_bay_overlap/);
    });
  });

  it('rejects an overlapping CONFIRMED appointment for the same technician in another bay', async () => {
    await insert({ bay: BAY_1, technician: ANONG, from: '10:00', to: '11:00' });

    await expect(
      insert({ bay: BAY_2, technician: ANONG, from: '10:30', to: '11:30', who: MALEE }),
    ).rejects.toThrow(/appointments_no_technician_overlap/);
  });

  it('accepts back-to-back appointments for the same bay and technician (half-open)', async () => {
    await insert({ bay: BAY_1, technician: ANONG, from: '10:00', to: '11:00' });

    await expect(
      insert({ bay: BAY_1, technician: ANONG, from: '11:00', to: '12:00' }),
    ).resolves.toBeDefined();
    await expect(
      insert({ bay: BAY_1, technician: ANONG, from: '09:00', to: '10:00' }),
    ).resolves.toBeDefined();
  });

  it('accepts overlapping appointments on different bays and technicians', async () => {
    await insert({ bay: BAY_1, technician: ANONG, from: '10:00', to: '11:00' });

    await expect(
      insert({ bay: BAY_2, technician: BOONSONG, from: '10:00', to: '11:00', who: MALEE }),
    ).resolves.toBeDefined();
  });

  it('accepts a CONFIRMED appointment overlapping a CANCELLED one on the same bay and technician', async () => {
    await insert({
      bay: BAY_1,
      technician: ANONG,
      from: '10:00',
      to: '11:00',
      status: 'CANCELLED',
    });

    await expect(
      insert({ bay: BAY_1, technician: ANONG, from: '10:00', to: '11:00' }),
    ).resolves.toBeDefined();
  });

  it('rejects re-confirming a cancelled appointment whose slot is now taken', async () => {
    await insert({
      bay: BAY_1,
      technician: ANONG,
      from: '10:00',
      to: '11:00',
      status: 'CANCELLED',
    });
    const cancelledId = `79000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
    await insert({ bay: BAY_1, technician: BOONSONG, from: '10:30', to: '11:30', who: MALEE });

    await expect(
      prisma.appointment.update({
        where: { id: cancelledId },
        data: { status: 'CONFIRMED', cancelledAt: null },
      }),
    ).rejects.toThrow(/appointments_no_bay_overlap/);
  });

  it('reports SQLSTATE 23P01 for an exclusion violation', async () => {
    await insert({ bay: BAY_1, technician: ANONG, from: '10:00', to: '11:00' });

    await expect(
      prisma.$executeRaw`
        INSERT INTO appointments (id, dealership_id, service_bay_id, technician_id, service_type_id,
                                  customer_id, vehicle_id, start_at, end_at, updated_at)
        VALUES ('79000000-0000-4000-8000-999999999999', ${BANGKOK}::uuid, ${BAY_1}::uuid, ${BOONSONG}::uuid,
                ${OIL_CHANGE}::uuid, ${MALEE.customerId}::uuid, ${MALEE.vehicleId}::uuid,
                ${at('10:30')}, ${at('11:30')}, now())`,
    ).rejects.toThrow(/23P01|exclusion constraint/);
  });
});
