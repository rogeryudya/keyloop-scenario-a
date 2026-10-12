import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/** Every env var the app reads. Documented in `.env.example`. */
export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  /** Secrets Manager secret holding RDS-format DB credentials. Takes precedence over DATABASE_URL. */
  @IsOptional()
  @IsString()
  DB_SECRET_ID?: string;

  /** Direct Postgres URL (tests and CI). */
  @IsOptional()
  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  })
  DATABASE_URL?: string;

  /** AWS region for Secrets Manager. Required with DB_SECRET_ID. */
  @IsOptional()
  @IsString()
  AWS_REGION?: string;

  /** Custom AWS endpoint (floci locally: http://localhost:4566). Unset in real AWS. */
  @IsOptional()
  @IsUrl(
    { require_tld: false, protocols: ['http', 'https'], require_protocol: true },
    { message: 'AWS_ENDPOINT_URL must be an http(s) URL' },
  )
  AWS_ENDPOINT_URL?: string;

  /** OTLP/HTTP collector (otel-lgtm locally: http://localhost:4318). Unset disables tracing. Read by the OTel SDK. */
  @IsOptional()
  @IsUrl(
    { require_tld: false, protocols: ['http', 'https'], require_protocol: true },
    { message: 'OTEL_EXPORTER_OTLP_ENDPOINT must be an http(s) URL' },
  )
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  /** Service name on traces (default keyloop-api). Read by the OTel SDK. */
  @IsOptional()
  @IsString()
  OTEL_SERVICE_NAME?: string;
}

export class InvalidEnvironmentError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'InvalidEnvironmentError';
  }
}

const isBlank = (value: unknown): boolean => value === undefined || value === '';

/**
 * Validates raw env vars and returns typed config. Reports every problem at once.
 * Messages name the variable but never echo its value (DATABASE_URL contains a password).
 */
export function validateEnv(raw: Record<string, string | undefined>): EnvironmentVariables {
  // Treat `KEY=` as unset so class defaults and @IsOptional apply.
  const present = Object.fromEntries(Object.entries(raw).filter(([, v]) => !isBlank(v)));
  const env = plainToInstance(EnvironmentVariables, present, { exposeDefaultValues: true });

  const problems = validateSync(env).flatMap((error) => Object.values(error.constraints ?? {}));
  if (isBlank(env.DB_SECRET_ID) && isBlank(env.DATABASE_URL)) {
    problems.push('one of DB_SECRET_ID or DATABASE_URL must be set');
  }
  if (!isBlank(env.DB_SECRET_ID) && isBlank(env.AWS_REGION)) {
    problems.push('AWS_REGION is required when DB_SECRET_ID is set');
  }
  if (problems.length > 0) {
    throw new InvalidEnvironmentError(problems);
  }
  return env;
}
