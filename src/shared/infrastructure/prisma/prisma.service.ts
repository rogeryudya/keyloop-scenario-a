import { OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../../generated/prisma/client';

/**
 * The app's single Prisma client. Built by `PrismaModule` with the URL from `DbCredentialsProvider`,
 * so it never reads env vars itself. Repositories use it via the transaction host, not directly.
 */
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(databaseUrl: string) {
    super({
      adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5_000 }),
    });
  }

  /** `$connect()` is lazy with driver adapters; a real round-trip proves the DB is reachable. */
  async verifyConnection(): Promise<void> {
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
