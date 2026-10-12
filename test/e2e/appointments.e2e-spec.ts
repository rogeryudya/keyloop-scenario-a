import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import data from '../../prisma/seed/data.json';
import { buildSeedPlan } from '../../prisma/seed/seed-plan';
import { writeSeed } from '../../prisma/seed/write-seed';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { FixedClock } from '../fakes/fixed-clock';
import { createTestApp } from '../helpers/app';
import { resetDb } from '../helpers/db';

interface ErrorJson {
  error: { code: string; message: string; details: { field?: string; issue: string }[] };
}

// Seed reference data (prisma/seed/data.json). Bangkok: UTC+7, 08:00–18:00, 3 bays.
const BANGKOK = '10000000-0000-4000-8000-000000000001';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001'; // 30 min
const SOMSAK = '50000000-0000-4000-8000-000000000001';
const SOMSAK_COROLLA = '60000000-0000-4000-8000-000000000001';

const NOW = '2030-01-14T00:00:00.000Z';

const booking = (overrides: Record<string, unknown> = {}) => ({
  customerId: SOMSAK,
  vehicleId: SOMSAK_COROLLA,
  dealershipId: BANGKOK,
  serviceTypeId: OIL_CHANGE,
  start: '2030-01-15T10:00:00+07:00',
  ...overrides,
});

describe('Appointments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp({ clock: new FixedClock(NOW) });
    prisma = app.get(PrismaService);
    await resetDb(prisma);
    await writeSeed(prisma, { ...buildSeedPlan(data, new Date(NOW)), appointments: [] });
  });

  beforeEach(async () => {
    await prisma.appointment.deleteMany();
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer() as App);

  describe('POST /v1/appointments', () => {
    it('books an appointment: 201, id and Location (FR-1, FR-3)', async () => {
      const res = await http().post('/v1/appointments').send(booking()).expect(201);
      const { id } = res.body as { id: string };

      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.headers.location).toBe(`/v1/appointments/${id}`);
    });
  });

  describe('GET /v1/appointments/:id', () => {
    it('returns the booked appointment with allocated bay and technician (FR-6)', async () => {
      const created = await http().post('/v1/appointments').send(booking()).expect(201);
      const location = created.headers.location as string;

      const res = await http().get(location).expect(200);

      expect(res.body).toEqual({
        id: (created.body as { id: string }).id,
        status: 'CONFIRMED',
        start: '2030-01-15T03:00:00.000Z',
        end: '2030-01-15T03:30:00.000Z',
        createdAt: NOW,
        cancelledAt: null,
        dealership: { id: BANGKOK, name: 'Keyloop Motors Bangkok', timeZone: 'Asia/Bangkok' },
        serviceBay: { id: '20000000-0000-4000-8000-000000000101', name: 'Bay 1' },
        technician: { id: '30000000-0000-4000-8000-000000000101', name: 'Anong Srisuk' },
        serviceType: {
          id: OIL_CHANGE,
          code: 'OIL_CHANGE',
          name: 'Oil and filter change',
          durationMinutes: 30,
        },
        customer: { id: SOMSAK, name: 'Somsak Jaidee' },
        vehicle: {
          id: SOMSAK_COROLLA,
          registration: '1กข 2345',
          make: 'Toyota',
          model: 'Corolla Altis',
        },
      });
    });

    it('returns 404 APPOINTMENT_NOT_FOUND for an unknown id', async () => {
      const res = await http()
        .get('/v1/appointments/79000000-0000-4000-8000-000000000099')
        .expect(404);

      expect((res.body as ErrorJson).error.code).toBe('APPOINTMENT_NOT_FOUND');
    });

    it('returns 400 VALIDATION_FAILED for a malformed id', async () => {
      const res = await http().get('/v1/appointments/not-a-uuid').expect(400);

      expect((res.body as ErrorJson).error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'id' }],
      });
    });
  });
});
