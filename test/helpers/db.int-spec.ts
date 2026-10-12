import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';
import { resetDb } from './db';

describe('resetDb (int)', () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) throw new Error('DATABASE_URL is set by globalSetup');
  const prisma = new PrismaService(databaseUrl);

  beforeAll(async () => {
    await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS reset_probe (id serial PRIMARY KEY, v text)`;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DROP TABLE IF EXISTS reset_probe`;
    await prisma.$disconnect();
  });

  it('empties app tables and restarts their identities', async () => {
    await prisma.$executeRaw`INSERT INTO reset_probe (v) VALUES ('a'), ('b')`;

    await resetDb(prisma);

    expect(await prisma.$queryRaw`SELECT count(*)::int AS n FROM reset_probe`).toEqual([{ n: 0 }]);
    await prisma.$executeRaw`INSERT INTO reset_probe (v) VALUES ('c')`;
    expect(await prisma.$queryRaw`SELECT id FROM reset_probe`).toEqual([{ id: 1 }]);
  });

  it('keeps the migration history', async () => {
    await resetDb(prisma);

    const rows = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM _prisma_migrations`;
    expect(rows[0]?.n).toBeGreaterThan(0);
  });
});
