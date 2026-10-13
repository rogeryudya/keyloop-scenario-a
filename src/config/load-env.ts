import { validateEnv } from './env.schema';
import { AppConfig } from './app-config';
import { loadDotEnv } from './dotenv';

/**
 * Loads `.env` (if present, and not under test) then validates `process.env`. Throws on invalid config,
 * which aborts bootstrap: fail fast. Variables already set in the environment win over `.env`.
 */
export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadDotEnv(env);
  return new AppConfig(validateEnv(env));
}
