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
// Hanoi: UTC+7, 09:00–17:00, 1 bay, nobody qualified for TRANSMISSION_REPAIR.
const BANGKOK = '10000000-0000-4000-8000-000000000001';
const HANOI = '10000000-0000-4000-8000-000000000003';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001'; // 30 min
const TRANSMISSION_REPAIR = '40000000-0000-4000-8000-000000000007'; // Bangkok: only Decha
const SOMSAK = '50000000-0000-4000-8000-000000000001';
const SOMSAK_COROLLA = '60000000-0000-4000-8000-000000000001';
const MALEE_CITY = '60000000-0000-4000-8000-000000000003';
const UNKNOWN = '99999999-0000-4000-8000-000000000000';

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

    const post = (body: Record<string, unknown>) => http().post('/v1/appointments').send(body);
    const errorOf = (res: { body: unknown }) => (res.body as ErrorJson).error;

    describe('400 VALIDATION_FAILED', () => {
      it.each([
        ['customerId', { customerId: 'nope' }],
        ['vehicleId', { vehicleId: undefined }],
        ['start', { start: 'tomorrow at ten' }],
        ['start', { start: '2030-01-15T10:00:00' }], // no offset (A-7)
      ])('rejects an invalid %s', async (field, overrides) => {
        const res = await post(booking(overrides)).expect(400);

        expect(errorOf(res)).toMatchObject({ code: 'VALIDATION_FAILED' });
        expect(errorOf(res).details.map((d) => d.field)).toContain(field);
      });

      it('rejects unknown body fields, e.g. a client-chosen bay (A-4)', async () => {
        const res = await post(booking({ serviceBayId: UNKNOWN })).expect(400);

        expect(errorOf(res).code).toBe('VALIDATION_FAILED');
      });
    });

    describe('404 (BR-13)', () => {
      it.each([
        ['DEALERSHIP_NOT_FOUND', { dealershipId: UNKNOWN }],
        ['SERVICE_TYPE_NOT_FOUND', { serviceTypeId: UNKNOWN }],
        ['CUSTOMER_NOT_FOUND', { customerId: UNKNOWN }],
        ['VEHICLE_NOT_FOUND', { vehicleId: UNKNOWN }],
      ])('returns %s', async (code, overrides) => {
        const res = await post(booking(overrides)).expect(404);

        expect(errorOf(res).code).toBe(code);
      });
    });

    describe('422 business rules', () => {
      it.each([
        [
          'APPOINTMENT_IN_PAST (BR-3)',
          'APPOINTMENT_IN_PAST',
          { start: '2030-01-13T10:00:00+07:00' },
        ],
        [
          'OUTSIDE_OPENING_HOURS (BR-4)',
          'OUTSIDE_OPENING_HOURS',
          { start: '2030-01-15T17:45:00+07:00' }, // 17:45–18:15, Bangkok closes 18:00
        ],
        [
          'VEHICLE_NOT_OWNED_BY_CUSTOMER (BR-5)',
          'VEHICLE_NOT_OWNED_BY_CUSTOMER',
          { vehicleId: MALEE_CITY },
        ],
        [
          'SERVICE_TYPE_NOT_SUPPORTED (BR-6)',
          'SERVICE_TYPE_NOT_SUPPORTED',
          { dealershipId: HANOI, serviceTypeId: TRANSMISSION_REPAIR },
        ],
      ])('returns %s', async (_name, code, overrides) => {
        const res = await post(booking(overrides)).expect(422);

        expect(errorOf(res).code).toBe(code);
        expect(await prisma.appointment.count()).toBe(0);
      });
    });

    describe('409 availability', () => {
      it('returns NO_SERVICE_BAY_AVAILABLE when the only bay is taken (BR-7)', async () => {
        await post(booking({ dealershipId: HANOI })).expect(201);

        const res = await post(booking({ dealershipId: HANOI })).expect(409);

        expect(errorOf(res).code).toBe('NO_SERVICE_BAY_AVAILABLE');
      });

      it('returns NO_TECHNICIAN_AVAILABLE when the only qualified technician is busy (BR-8)', async () => {
        await post(booking({ serviceTypeId: TRANSMISSION_REPAIR })).expect(201);

        const res = await post(
          booking({ serviceTypeId: TRANSMISSION_REPAIR, start: '2030-01-15T11:00:00+07:00' }),
        ).expect(409);

        expect(errorOf(res).code).toBe('NO_TECHNICIAN_AVAILABLE');
      });

      it('books back-to-back on the same bay (BR-2)', async () => {
        await post(booking({ dealershipId: HANOI })).expect(201);

        await post(booking({ dealershipId: HANOI, start: '2030-01-15T10:30:00+07:00' })).expect(
          201,
        );
      });
    });

    it('is only reachable under /v1', async () => {
      await http().post('/appointments').send(booking()).expect(404);
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

  describe('POST /v1/appointments/:id/cancel', () => {
    const book = async (overrides: Record<string, unknown> = {}): Promise<string> => {
      const res = await http().post('/v1/appointments').send(booking(overrides)).expect(201);
      return (res.body as { id: string }).id;
    };
    const cancel = (id: string) => http().post(`/v1/appointments/${id}/cancel`);

    it('returns 200 with the cancelled appointment (FR-8)', async () => {
      const id = await book();

      const res = await cancel(id).expect(200);

      expect(res.body).toMatchObject({ id, status: 'CANCELLED', cancelledAt: NOW });
      const reread = await http().get(`/v1/appointments/${id}`).expect(200);
      expect(reread.body).toMatchObject({ status: 'CANCELLED', cancelledAt: NOW });
    });

    it('frees the slot: availability shows it again and booking it succeeds (acceptance)', async () => {
      // Hanoi has one bay, so a booking at 10:00 removes 10:00 from availability.
      const startsAt = async (): Promise<string[]> => {
        const res = await http()
          .get(`/v1/dealerships/${HANOI}/availability`)
          .query({ serviceTypeId: OIL_CHANGE, date: '2030-01-15' })
          .expect(200);
        return (res.body as { data: { start: string }[] }).data.map((s) => s.start);
      };
      const id = await book({ dealershipId: HANOI });
      expect(await startsAt()).not.toContain('2030-01-15T10:00:00+07:00');

      await cancel(id).expect(200);

      expect(await startsAt()).toContain('2030-01-15T10:00:00+07:00');
      await book({ dealershipId: HANOI });
    });

    it('returns 422 APPOINTMENT_NOT_CANCELLABLE when already cancelled (BR-12)', async () => {
      const id = await book();
      await cancel(id).expect(200);

      const res = await cancel(id).expect(422);

      expect((res.body as ErrorJson).error.code).toBe('APPOINTMENT_NOT_CANCELLABLE');
    });

    it('returns 404 APPOINTMENT_NOT_FOUND for an unknown id', async () => {
      const res = await cancel('79000000-0000-4000-8000-000000000099').expect(404);

      expect((res.body as ErrorJson).error.code).toBe('APPOINTMENT_NOT_FOUND');
    });

    it('returns 400 VALIDATION_FAILED for a malformed id', async () => {
      const res = await cancel('not-a-uuid').expect(400);

      expect((res.body as ErrorJson).error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [{ field: 'id' }],
      });
    });
  });
});
