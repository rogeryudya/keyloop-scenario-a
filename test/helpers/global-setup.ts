import { execFileSync } from 'node:child_process';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Wait } from 'testcontainers';
import { POSTGRES_IMAGE } from './postgres';

/** Shared with global-teardown.ts; both run in Jest's parent process. */
export const containerSlot = globalThis as { __keyloopPostgres?: StartedPostgreSqlContainer };

/**
 * Jest globalSetup for the `int` and `e2e` projects: start a throwaway Postgres, apply migrations,
 * expose DATABASE_URL to the tests. Idempotent, so running both projects together reuses one container.
 */
export default async function globalSetup(): Promise<void> {
  if (containerSlot.__keyloopPostgres === undefined) {
    containerSlot.__keyloopPostgres = await new PostgreSqlContainer(POSTGRES_IMAGE)
      .withDatabase('keyloop_test')
      .withUsername('keyloop')
      .withPassword('keyloop')
      // Health check (pg_isready) only. The default also probes the internal port via `docker exec`,
      // which hangs forever on Podman for Windows.
      .withWaitStrategy(Wait.forHealthCheck())
      .withStartupTimeout(60_000)
      .start();
  }

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = containerSlot.__keyloopPostgres.getConnectionUri();
  delete process.env.DB_SECRET_ID;

  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    env: process.env,
    stdio: 'pipe',
  });
}
