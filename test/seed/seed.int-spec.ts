import data from '../../prisma/seed/data.json';
import { buildSeedPlan } from '../../prisma/seed/seed-plan';
import { writeSeed } from '../../prisma/seed/write-seed';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { resetDb } from '../helpers/db';

describe('writeSeed (int)', () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) throw new Error('DATABASE_URL is set by globalSetup');
  const prisma = new PrismaService(databaseUrl);

  const counts = async (): Promise<Record<string, number>> => ({
    dealerships: await prisma.dealership.count(),
    serviceBays: await prisma.serviceBay.count(),
    serviceTypes: await prisma.serviceType.count(),
    technicians: await prisma.technician.count(),
    qualifications: await prisma.technicianQualification.count(),
    customers: await prisma.customer.count(),
    vehicles: await prisma.vehicle.count(),
    appointments: await prisma.appointment.count(),
  });

  beforeEach(() => resetDb(prisma));
  afterAll(async () => {
    await resetDb(prisma);
    await prisma.$disconnect();
  });

  it('loads data.json and passes every DB constraint', async () => {
    await writeSeed(prisma, buildSeedPlan(data, new Date('2026-10-12T05:00:00.000Z')));

    expect(await counts()).toEqual({
      dealerships: 3,
      serviceBays: 6,
      serviceTypes: 7,
      technicians: 9,
      qualifications: 27,
      customers: 6,
      vehicles: 8,
      appointments: 3,
    });
  });

  it('is idempotent and moves demo appointments to the new "tomorrow"', async () => {
    await writeSeed(prisma, buildSeedPlan(data, new Date('2026-10-12T05:00:00.000Z')));
    const before = await counts();

    await writeSeed(prisma, buildSeedPlan(data, new Date('2026-10-13T05:00:00.000Z')));

    expect(await counts()).toEqual(before);
    const hanoi = await prisma.appointment.findUniqueOrThrow({
      where: { id: '70000000-0000-4000-8000-000000000001' },
    });
    expect(hanoi.startAt).toEqual(new Date('2026-10-14T03:00:00.000Z'));
  });
});
