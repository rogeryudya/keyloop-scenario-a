import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createTestApp } from '../helpers/app';

interface ErrorJson {
  error: { code: string; message: string; details: unknown[] };
}

describe('Platform (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer() as App);

  describe('GET /health', () => {
    it('returns 200 with the real database up', async () => {
      await http().get('/health').expect(200, { status: 'ok', db: 'up' });
    });

    it('is not versioned', async () => {
      await http().get('/v1/health').expect(404);
    });
  });

  describe('request id', () => {
    it('returns a generated x-request-id', async () => {
      const res = await http().get('/v1/service-types').expect(200);

      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('echoes a caller-supplied x-request-id, also on errors', async () => {
      const res = await http()
        .get('/v1/does-not-exist')
        .set('x-request-id', 'client-req-42')
        .expect(404);

      expect(res.headers['x-request-id']).toBe('client-req-42');
    });

    it('replaces an unsafe x-request-id', async () => {
      const res = await http().get('/v1/service-types').set('x-request-id', 'a b c').expect(200);

      expect(res.headers['x-request-id']).not.toBe('a b c');
    });
  });

  describe('error format', () => {
    it('returns the standard error JSON for an unknown route', async () => {
      const res = await http().get('/v1/does-not-exist').expect(404);

      expect((res.body as ErrorJson).error).toEqual({
        code: 'NOT_FOUND',
        message: 'Cannot GET /v1/does-not-exist',
        details: [],
      });
    });

    it('returns the standard error JSON for a malformed JSON body', async () => {
      const res = await http()
        .post('/v1/anything')
        .set('Content-Type', 'application/json')
        .send('{"broken": ')
        .expect(400);

      expect((res.body as ErrorJson).error.code).toBe('BAD_REQUEST');
    });
  });

  describe('Swagger', () => {
    it('documents /health in the OpenAPI document', async () => {
      const res = await http().get('/docs-json').expect(200);

      expect((res.body as { paths: Record<string, unknown> }).paths).toHaveProperty(['/health']);
    });
  });
});
