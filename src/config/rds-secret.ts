/** Postgres credentials in the RDS secret format (docs/local-dev/aws-emulation.md). */
export interface RdsSecret {
  readonly host: string;
  readonly port: number;
  readonly username: string;
  readonly password: string;
  readonly dbname: string;
}

export class InvalidDbSecretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDbSecretError';
  }
}

const POSTGRES_ENGINES = ['postgres', 'postgresql'];

/**
 * Parses and validates the secret JSON. Reports every problem at once.
 * Messages name the secret and the field but never echo values (the secret holds a password).
 */
export function parseRdsSecret(secretId: string, raw: string): RdsSecret {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new InvalidDbSecretError(`DB secret "${secretId}" is not valid JSON`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InvalidDbSecretError(`DB secret "${secretId}" is not a JSON object`);
  }
  const fields = value as Record<string, unknown>;
  const problems: string[] = [];

  const text = (key: string): string => {
    const field = fields[key];
    if (typeof field === 'string' && field.trim() !== '') return field;
    problems.push(`${key} must be a non-empty string`);
    return '';
  };

  const engine = fields.engine;
  if (engine !== undefined && (typeof engine !== 'string' || !POSTGRES_ENGINES.includes(engine))) {
    problems.push('engine must be postgres');
  }
  const host = text('host');
  const port = toPort(fields.port);
  if (port === undefined) problems.push('port must be an integer between 1 and 65535');
  const username = text('username');
  const password = text('password');
  const dbname = text('dbname');

  if (problems.length > 0 || port === undefined) {
    throw new InvalidDbSecretError(`DB secret "${secretId}" is invalid: ${problems.join('; ')}`);
  }
  return { host, port, username, password, dbname };
}

/** RDS writes the port as a number; accept a numeric string too, as hand-made secrets often use one. */
function toPort(value: unknown): number | undefined {
  const port = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535
    ? port
    : undefined;
}

export function toPostgresUrl(secret: RdsSecret): string {
  const user = encodeURIComponent(secret.username);
  const password = encodeURIComponent(secret.password);
  return `postgresql://${user}:${password}@${secret.host}:${secret.port}/${encodeURIComponent(secret.dbname)}`;
}
