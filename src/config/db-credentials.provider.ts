import { Injectable } from '@nestjs/common';
import { AppConfig } from './app-config';
import { parseRdsSecret, toPostgresUrl } from './rds-secret';
import { SecretSource } from './secret-source';

/**
 * Resolves the Postgres connection URL. Same code path everywhere; only env vars differ
 * (docs/local-dev/aws-emulation.md): DB_SECRET_ID → Secrets Manager, else DATABASE_URL (tests/CI).
 */
@Injectable()
export class DbCredentialsProvider {
  private databaseUrl?: Promise<string>;

  constructor(
    private readonly config: AppConfig,
    private readonly secrets: SecretSource,
  ) {}

  /** Resolved once and cached: the secret is read at startup only (rotation is out of scope). */
  getDatabaseUrl(): Promise<string> {
    this.databaseUrl ??= this.resolve();
    return this.databaseUrl;
  }

  private async resolve(): Promise<string> {
    const secretId = this.config.dbSecretId;
    if (secretId !== undefined) {
      const raw = await this.secrets.getSecretString(secretId);
      return toPostgresUrl(parseRdsSecret(secretId, raw));
    }
    if (this.config.databaseUrl !== undefined) {
      return this.config.databaseUrl;
    }
    // Unreachable after validateEnv, kept so the provider is safe on its own.
    throw new Error('No DB credentials: set DB_SECRET_ID or DATABASE_URL');
  }
}
