import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from '../configure-app';
import { DatabaseHealthIndicator } from './database.health';
import { HealthController } from './health.controller';

class FakeDatabaseHealth {
  up = true;
  isUp(): Promise<boolean> {
    return Promise.resolve(this.up);
  }
}

describe('HealthController', () => {
  let app: INestApplication;
  const database = new FakeDatabaseHealth();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DatabaseHealthIndicator, useValue: database }],
    }).compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer() as App);

  it('returns 200 when the database is up', async () => {
    database.up = true;

    await http().get('/health').expect(200, { status: 'ok', db: 'up' });
  });

  it('returns 503 in the standard error format when the database is down', async () => {
    database.up = false;

    await http()
      .get('/health')
      .expect(503, {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Database is unreachable',
          details: [{ field: 'db', issue: 'down' }],
        },
      });
  });

  it('is version-neutral', async () => {
    database.up = true;

    await http().get('/v1/health').expect(404);
  });
});
