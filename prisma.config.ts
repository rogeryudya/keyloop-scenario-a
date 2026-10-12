import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// The Prisma CLI doesn't load `.env`. Mirror the app (src/config/load-env.ts): shell vars win over the file.
// M4 replaces this with `scripts/local/with-db-url.ts`, which resolves DB_SECRET_ID like the app does.
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
