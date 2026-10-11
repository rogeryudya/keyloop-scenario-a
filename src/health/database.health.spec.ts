import { Logger } from '@nestjs/common';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';
import { DatabaseHealthIndicator } from './database.health';

/** Only `$queryRaw` matters here; the real client is covered by the e2e health test. */
const prismaWith = (queryRaw: () => Promise<unknown>): PrismaService =>
  ({ $queryRaw: queryRaw }) as unknown as PrismaService;

describe('DatabaseHealthIndicator', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('is up when the query succeeds', async () => {
    await expect(
      new DatabaseHealthIndicator(prismaWith(() => Promise.resolve([{ '?column?': 1 }]))).isUp(),
    ).resolves.toBe(true);
  });

  it('is down when the query fails', async () => {
    const failing = prismaWith(() => Promise.reject(new Error('ECONNREFUSED')));

    await expect(new DatabaseHealthIndicator(failing).isUp()).resolves.toBe(false);
  });

  it('is down when the query hangs past the timeout', async () => {
    const hanging = prismaWith(() => new Promise(() => undefined));

    await expect(new DatabaseHealthIndicator(hanging, 20).isUp()).resolves.toBe(false);
  });
});
