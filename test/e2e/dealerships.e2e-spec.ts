import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import data from '../../prisma/seed/data.json';
import { buildSeedPlan } from '../../prisma/seed/seed-plan';
import { writeSeed } from '../../prisma/seed/write-seed';
import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { createTestApp } from '../helpers/app';
import { resetDb } from '../helpers/db';

interface PageJson<T> {
  data: T[];
  meta: { nextCursor: string | null; limit: number };
}
interface DealershipJson {
  id: string;
  name: string;
  timeZone: string;
  openingHours: { opensAt: string; closesAt: string };
  supportedServiceTypeIds?: string[];
}
interface ServiceTypeJson {
  id: string;
  code: string;
  name: string;
  durationMinutes: number;
}
interface ErrorJson {
  error: { code: string; message: string; details: { field?: string; issue: string }[] };
}

const BANGKOK = '10000000-0000-4000-8000-000000000001';

describe('Dealerships and service types (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    await resetDb(prisma);
    await writeSeed(prisma, buildSeedPlan(data, new Date()));
  });

  afterAll(async () => {
    await resetDb(prisma);
    await app.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer() as App);

  describe('GET /v1/dealerships', () => {
    it('lists dealerships with the default page size', async () => {
      const res = await http().get('/v1/dealerships').expect(200);
      const body = res.body as PageJson<DealershipJson>;

      expect(body.meta).toEqual({ nextCursor: null, limit: 20 });
      expect(body.data).toHaveLength(3);
      expect(body.data).toContainEqual({
        id: BANGKOK,
        name: 'Keyloop Motors Bangkok',
        timeZone: 'Asia/Bangkok',
        openingHours: { opensAt: '08:00', closesAt: '18:00' },
      });
    });

    it('pages with limit and nextCursor', async () => {
      const first = (await http().get('/v1/dealerships?limit=2').expect(200))
        .body as PageJson<DealershipJson>;
      expect(first.data).toHaveLength(2);
      expect(first.meta.limit).toBe(2);
      expect(first.meta.nextCursor).toEqual(expect.any(String));

      const second = (
        await http()
          .get('/v1/dealerships')
          .query({ limit: 2, cursor: first.meta.nextCursor })
          .expect(200)
      ).body as PageJson<DealershipJson>;

      expect(second.data).toHaveLength(1);
      expect(second.meta.nextCursor).toBeNull();
      const ids = [...first.data, ...second.data].map((d) => d.id);
      expect(new Set(ids).size).toBe(3);
    });

    it.each(['0', '101', 'abc'])('rejects limit=%s with VALIDATION_FAILED', async (limit) => {
      const res = await http().get('/v1/dealerships').query({ limit }).expect(400);

      const { error } = res.body as ErrorJson;
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details.map((d) => d.field)).toContain('limit');
      expect(error.details.every((d) => d.field === 'limit')).toBe(true);
    });

    it('rejects a tampered cursor with INVALID_CURSOR', async () => {
      const res = await http().get('/v1/dealerships?cursor=bm90LWEtY3Vyc29y').expect(400);

      expect((res.body as ErrorJson).error.code).toBe('INVALID_CURSOR');
    });

    it('rejects unknown query parameters', async () => {
      const res = await http().get('/v1/dealerships?page=2').expect(400);

      expect((res.body as ErrorJson).error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('GET /v1/dealerships/:id', () => {
    it('returns the dealership with the service types it supports', async () => {
      const res = await http().get(`/v1/dealerships/${BANGKOK}`).expect(200);
      const body = res.body as DealershipJson;

      expect(body).toMatchObject({ id: BANGKOK, timeZone: 'Asia/Bangkok' });
      // Bangkok technicians cover all 7 service types.
      expect(body.supportedServiceTypeIds).toHaveLength(7);
    });

    it('returns 404 DEALERSHIP_NOT_FOUND for an unknown id', async () => {
      const res = await http()
        .get('/v1/dealerships/10000000-0000-4000-8000-000000000099')
        .expect(404);

      expect((res.body as ErrorJson).error.code).toBe('DEALERSHIP_NOT_FOUND');
    });

    it('returns 400 VALIDATION_FAILED for a malformed id', async () => {
      const res = await http().get('/v1/dealerships/not-a-uuid').expect(400);

      expect((res.body as ErrorJson).error).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: [expect.objectContaining({ field: 'id' })],
      });
    });
  });

  describe('GET /v1/service-types', () => {
    it('lists all service types with their durations', async () => {
      const res = await http().get('/v1/service-types').expect(200);
      const body = res.body as PageJson<ServiceTypeJson>;

      expect(body.data).toHaveLength(7);
      expect(body.data).toContainEqual({
        id: '40000000-0000-4000-8000-000000000001',
        code: 'OIL_CHANGE',
        name: 'Oil and filter change',
        durationMinutes: 30,
      });
      expect(body.meta.nextCursor).toBeNull();
    });

    it('pages with limit', async () => {
      const res = await http().get('/v1/service-types?limit=3').expect(200);
      const body = res.body as PageJson<ServiceTypeJson>;

      expect(body.data).toHaveLength(3);
      expect(body.meta.limit).toBe(3);
      expect(typeof body.meta.nextCursor).toBe('string');
    });
  });

  it('documents the endpoints in Swagger', async () => {
    const res = await http().get('/docs-json').expect(200);
    const paths = (res.body as { paths: Record<string, unknown> }).paths;

    expect(Object.keys(paths)).toEqual(
      expect.arrayContaining(['/v1/dealerships', '/v1/dealerships/{id}', '/v1/service-types']),
    );
  });
});
