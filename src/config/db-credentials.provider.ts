import { Injectable } from '@nestjs/common';
import { AppConfig } from './app-config';

/**
 * Resolves the Postgres connection URL. Same code path everywhere; only env vars differ
 * (docs/local-dev/aws-emulation.md). Secrets Manager mode lands in M4.
 */
@Injectable()
export class DbCredentialsProvider {
  constructor(private readonly config: AppConfig) {}

  getDatabaseUrl(): Promise<string> {
    if (this.config.dbSecretId !== undefined) {
      return Promise.reject(
        new Error('DB_SECRET_ID (Secrets Manager) is not supported yet; set DATABASE_URL instead'),
      );
    }
    if (this.config.databaseUrl !== undefined) {
      return Promise.resolve(this.config.databaseUrl);
    }
    // Unreachable after validateEnv, kept so the provider is safe on its own.
    return Promise.reject(new Error('No DB credentials: set DB_SECRET_ID or DATABASE_URL'));
  }
}
