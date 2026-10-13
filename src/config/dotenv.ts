import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Loads `.env` into `process.env` (if present, and not under test). Variables already set in the
 * environment win over `.env`. Kept free of decorators: `instrumentation.ts` calls it before
 * `reflect-metadata` is loaded.
 */
export function loadDotEnv(env: NodeJS.ProcessEnv = process.env): void {
  const envFile = resolve(process.cwd(), '.env');
  if (env === process.env && env.NODE_ENV !== 'test' && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}
