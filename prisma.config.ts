import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// `pnpm db:*` run Prisma through scripts/local/with-db-url.ts, which resolves DB_SECRET_ID like the app and sets
// DATABASE_URL. Loading `.env` here covers direct `prisma` calls; shell vars (incl. that DATABASE_URL) win over the file.
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) {
  process.loadEnvFile('.env');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // Optional so `prisma generate` works without a DB; migrate commands fail clearly if it's missing.
  datasource: { url: process.env.DATABASE_URL },
});
