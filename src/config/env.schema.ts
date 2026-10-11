import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
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

  /** Direct Postgres URL (tests, CI, and the temporary M0 dev DB). */
  @IsOptional()
  @Matches(/^postgres(ql)?:\/\/\S+$/, {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  })
  DATABASE_URL?: string;
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
  if (problems.length > 0) {
    throw new InvalidEnvironmentError(problems);
  }
  return env;
}
