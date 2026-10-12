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
interface AvailabilityJson {
  data: { start: string; end: string }[];
}

// Seed reference data (prisma/seed/data.json). Bangkok: UTC+7, 08:00–18:00.
// Hanoi: UTC+7, 09:00–17:00, nobody qualified for TRANSMISSION_REPAIR.
const BANGKOK = '10000000-0000-4000-8000-000000000001';
const HANOI = '10000000-0000-4000-8000-000000000003';
const OIL_CHANGE = '40000000-0000-4000-8000-000000000001'; // 30 min
const TRANSMISSION_REPAIR = '40000000-0000-4000-8000-000000000007';
const SOMSAK = '50000000-0000-4000-8000-000000000001';
const SOMSAK_COROLLA = '60000000-0000-4000-8000-000000000001';
const UNKNOWN = '99999999-0000-4000-8000-000000000000';

const NOW = '2030-01-14T00:00:00.000Z';
const DATE = '2030-01-15';

describe('Availability (e2e)', () => {
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
  const availability = (dealershipId: string, query: Record<string, string>) =>
    http().get(`/v1/dealerships/${dealershipId}/availability`).query(query);
  const errorOf = (res: { body: unknown }) => (res.body as ErrorJson).error;

  describe('GET /v1/dealerships/:id/availability', () => {
    it("returns the day's slots in the dealership's local time (FR-7)", async () => {
      const res = await availability(BANGKOK, { serviceTypeId: OIL_CHANGE, date: DATE }).expect(
        200,
      );
      const { data: slots } = res.body as AvailabilityJson;

      expect(slots).toHaveLength(39); // 08:00 … 17:30 every 15 min
      expect(slots[0]).toEqual({
        start: '2030-01-15T08:00:00+07:00',
        end: '2030-01-15T08:30:00+07:00',
      });
      expect(slots.at(-1)).toEqual({
        start: '2030-01-15T17:30:00+07:00',
        end: '2030-01-15T18:00:00+07:00',
      });
    });

    it('offers a slot that can be booked immediately (acceptance)', async () => {
      const res = await availability(BANGKOK, { serviceTypeId: OIL_CHANGE, date: DATE });
      const [slot] = (res.body as AvailabilityJson).data;

      await http()
        .post('/v1/appointments')
        .send({
          customerId: SOMSAK,
          vehicleId: SOMSAK_COROLLA,
          dealershipId: BANGKOK,
          serviceTypeId: OIL_CHANGE,
          start: slot?.start,
        })
        .expect(201);
    });

    it('returns no slots for a day already over', async () => {
      const res = await availability(BANGKOK, { serviceTypeId: OIL_CHANGE, date: '2030-01-13' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: [] });
    });

    describe('400 VALIDATION_FAILED', () => {
      it.each([
        ['serviceTypeId', { serviceTypeId: 'nope', date: DATE }],
        ['serviceTypeId', { date: DATE }],
        ['date', { serviceTypeId: OIL_CHANGE }],
        ['date', { serviceTypeId: OIL_CHANGE, date: '15/01/2030' }],
        ['date', { serviceTypeId: OIL_CHANGE, date: '2030-01-15T08:00:00+07:00' }],
        ['date', { serviceTypeId: OIL_CHANGE, date: '2030-02-30' }],
      ])('rejects an invalid %s', async (field, query) => {
        const res = await availability(BANGKOK, query).expect(400);

        expect(errorOf(res).code).toBe('VALIDATION_FAILED');
        expect(errorOf(res).details.map((d) => d.field)).toContain(field);
      });

      it('rejects a malformed dealership id', async () => {
        const res = await availability('nope', { serviceTypeId: OIL_CHANGE, date: DATE }).expect(
          400,
        );

        expect(errorOf(res).details.map((d) => d.field)).toContain('id');
      });
    });

    it.each([
      ['DEALERSHIP_NOT_FOUND', UNKNOWN, OIL_CHANGE],
      ['SERVICE_TYPE_NOT_FOUND', BANGKOK, UNKNOWN],
    ])('returns 404 %s', async (code, dealershipId, serviceTypeId) => {
      const res = await availability(dealershipId, { serviceTypeId, date: DATE }).expect(404);

      expect(errorOf(res).code).toBe(code);
    });

    it('returns 422 SERVICE_TYPE_NOT_SUPPORTED with an availability message (BR-6)', async () => {
      const res = await availability(HANOI, {
        serviceTypeId: TRANSMISSION_REPAIR,
        date: DATE,
      }).expect(422);

      expect(errorOf(res)).toMatchObject({
        code: 'SERVICE_TYPE_NOT_SUPPORTED',
        message:
          'This dealership does not offer the service type, so it has no availability for it',
      });
    });
  });
});
