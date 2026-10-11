import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateEnv } from './env.schema';
import { AppConfig } from './app-config';

/**
 * Loads `.env` (if present, and not under test) then validates `process.env`. Throws on invalid config,
 * which aborts bootstrap: fail fast. Variables already set in the environment win over `.env`.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const envFile = resolve(process.cwd(), '.env');
  if (env === process.env && env.NODE_ENV !== 'test' && existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
  return new AppConfig(validateEnv(env));
}
