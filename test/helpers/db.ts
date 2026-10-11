import { PrismaService } from '../../src/shared/infrastructure/prisma/prisma.service';

/**
 * Empties every app table between tests (`beforeEach`). Keeps `_prisma_migrations`.
 * Tables are discovered, so new migrations need no change here.
 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;

  const list = tables.map(({ tablename }) => `"public"."${tablename.replace(/"/g, '""')}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list.join(', ')} RESTART IDENTITY CASCADE`);
}
