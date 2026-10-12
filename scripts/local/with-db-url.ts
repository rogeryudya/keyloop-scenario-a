/**
 * Runs the Prisma CLI with DATABASE_URL resolved exactly like the app does (DB_SECRET_ID → Secrets Manager,
 * else DATABASE_URL), so migrations and seed never need the password in `.env`.
 * Usage: tsx scripts/local/with-db-url.ts <prisma args...>   e.g. `migrate deploy`, `db seed`
 */
import { spawnSync } from 'node:child_process';
import { DbCredentialsProvider } from '../../src/config/db-credentials.provider';
import { loadAppConfig } from '../../src/config/load-env';
import { SecretsManagerSecretSource } from '../../src/config/secret-source';

async function main(prismaArgs: string[]): Promise<number> {
  const config = loadAppConfig();
  const credentials = new DbCredentialsProvider(
    config,
    SecretsManagerSecretSource.fromConfig(config),
  );
  const databaseUrl = await credentials.getDatabaseUrl();

  // Run Prisma's JS entry with this Node binary: no shell, works the same on Windows and Linux.
  const prismaCli = require.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [prismaCli, ...prismaArgs], {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

main(process.argv.slice(2)).then(
  (status) => {
    process.exitCode = status;
  },
  (error: unknown) => {
    // Message only: config and secret errors are written to never contain secret values.
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  },
);
