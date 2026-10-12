import {
  Body,
  Controller,
  Get,
  INestApplication,
  Post,
  Query,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';
import request, { Response } from 'supertest';
import type { App } from 'supertest/types';
import { configureApp } from './configure-app';
import { ConflictError } from './shared/domain/errors';

// In-process HTTP test of the pipeline configureApp() sets up. No DB: uses a throwaway controller.

class CreateThingRequestDto {
  @IsString()
  name!: string; // assigned by class-transformer from the request body

  @IsInt()
  @Min(1)
  @Max(10)
  size!: number; // assigned by class-transformer from the request body
}

class LimitQueryDto {
  @Type(() => Number)
  @IsInt()
  limit!: number; // assigned by class-transformer from the query string
}

class ThingConflictError extends ConflictError {
  constructor() {
    super('THING_CONFLICT', 'Thing already exists');
  }
}

@Controller({ path: 'things', version: '1' })
class ThingsController {
  @Post()
  create(@Body() dto: CreateThingRequestDto): { name: string; size: number } {
    return { name: dto.name, size: dto.size };
  }

  @Get('limit')
  limit(@Query() query: LimitQueryDto): { limit: number; type: string } {
    return { limit: query.limit, type: typeof query.limit };
  }

  @Get('conflict')
  conflict(): never {
    throw new ThingConflictError();
  }

  @Get('crash')
  crash(): never {
    throw new Error('connection to db.internal:5432 refused');
  }
}

@Controller({ path: 'ping', version: VERSION_NEUTRAL })
class PingController {
  @Get()
  ping(): { ok: true } {
    return { ok: true };
  }
}

interface ErrorJson {
  error: { code: string; message: string; details: { field?: string; issue: string }[] };
}
interface OpenApiJson {
  paths: Record<string, unknown>;
  components: { schemas: Record<string, unknown> };
}
const errorOf = (res: Response): ErrorJson['error'] => (res.body as ErrorJson).error;

describe('configureApp', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController, PingController],
    }).compile();
    app = configureApp(moduleRef.createNestApplication({ logger: false }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = (): ReturnType<typeof request> => request(app.getHttpServer() as App);

  describe('versioning', () => {
    it('serves versioned routes under /v1', async () => {
      await http().get('/v1/things/limit?limit=5').expect(200);
    });

    it('does not serve versioned routes without the prefix', async () => {
      await http().get('/things/limit?limit=5').expect(404);
    });

    it('serves version-neutral routes without a prefix', async () => {
      await http().get('/ping').expect(200, { ok: true });
    });
  });

  describe('errors', () => {
    it('returns the standard error for an unknown route', async () => {
      const res = await http().get('/v1/nope').expect(404);

      expect(res.body).toEqual({
        error: { code: 'NOT_FOUND', message: expect.any(String) as string, details: [] },
      });
    });

    it('maps domain errors to their status and code', async () => {
      const res = await http().get('/v1/things/conflict').expect(409);

      expect(res.body).toEqual({
        error: { code: 'THING_CONFLICT', message: 'Thing already exists', details: [] },
      });
    });

    it('hides unexpected errors behind a generic 500', async () => {
      const res = await http().get('/v1/things/crash').expect(500);

      expect(res.body).toEqual({
        error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: [] },
      });
      expect(JSON.stringify(res.body)).not.toContain('db.internal');
    });

    it('returns the standard error for malformed JSON', async () => {
      const res = await http()
        .post('/v1/things')
        .set('Content-Type', 'application/json')
        .send('{"name": ')
        .expect(400);

      expect(res.body).toEqual({
        error: { code: 'BAD_REQUEST', message: expect.any(String) as string, details: [] },
      });
    });
  });

  describe('validation', () => {
    it('accepts a valid body', async () => {
      await http()
        .post('/v1/things')
        .send({ name: 'a', size: 3 })
        .expect(201, { name: 'a', size: 3 });
    });

    it('rejects an invalid body with field details', async () => {
      const res = await http().post('/v1/things').send({ name: 42, size: 11 }).expect(400);

      expect(errorOf(res).code).toBe('VALIDATION_FAILED');
      expect(errorOf(res).details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'size' }),
        ]),
      );
    });

    it('rejects unknown properties', async () => {
      const res = await http()
        .post('/v1/things')
        .send({ name: 'a', size: 3, isAdmin: true })
        .expect(400);

      expect(errorOf(res).details).toEqual([expect.objectContaining({ field: 'isAdmin' })]);
    });

    it('transforms query strings to declared types', async () => {
      await http().get('/v1/things/limit?limit=7').expect(200, { limit: 7, type: 'number' });
    });
  });

  describe('swagger', () => {
    it('serves the OpenAPI document with versioned paths and the error schema', async () => {
      const res = await http().get('/docs-json').expect(200);

      const doc = res.body as OpenApiJson;

      expect(doc.paths).toHaveProperty(['/v1/things']);
      expect(doc.paths).toHaveProperty(['/ping']);
      expect(doc.components.schemas).toHaveProperty('ErrorResponseDto');
    });

    it('serves the Swagger UI at /docs', async () => {
      await http().get('/docs').expect(200);
    });
  });
});
