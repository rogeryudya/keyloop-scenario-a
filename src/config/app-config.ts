import { EnvironmentVariables, NodeEnv } from './env.schema';

/** Typed, validated configuration. The only way the app reads env vars. */
export class AppConfig {
  constructor(private readonly env: EnvironmentVariables) {}

  get nodeEnv(): NodeEnv {
    return this.env.NODE_ENV;
  }

  get port(): number {
    return this.env.PORT;
  }

  get dbSecretId(): string | undefined {
    return this.env.DB_SECRET_ID;
  }

  get databaseUrl(): string | undefined {
    return this.env.DATABASE_URL;
  }
}
