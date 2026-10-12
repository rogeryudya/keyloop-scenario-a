import { InvalidDbSecretError, parseRdsSecret, RdsSecret, toPostgresUrl } from './rds-secret';

const ID = 'keyloop/local/db';
const valid = {
  engine: 'postgres',
  host: 'localhost',
  port: 7001,
  username: 'keyloop',
  password: 'hunter2',
  dbname: 'keyloop',
};

function parse(value: unknown): RdsSecret {
  return parseRdsSecret(ID, JSON.stringify(value));
}

function errorOf(raw: string): InvalidDbSecretError {
  try {
    parseRdsSecret(ID, raw);
  } catch (error) {
    if (error instanceof InvalidDbSecretError) return error;
    throw error;
  }
  throw new Error('expected parseRdsSecret to throw');
}

describe('parseRdsSecret', () => {
  it('parses an RDS-format secret', () => {
    expect(parse(valid)).toEqual({
      host: 'localhost',
      port: 7001,
      username: 'keyloop',
      password: 'hunter2',
      dbname: 'keyloop',
    });
  });

  it('accepts engine "postgresql" and a missing engine', () => {
    expect(() => parse({ ...valid, engine: 'postgresql' })).not.toThrow();
    const { engine: _engine, ...withoutEngine } = valid;
    expect(() => parse(withoutEngine)).not.toThrow();
  });

  it('ignores extra fields such as dbInstanceIdentifier', () => {
    expect(() => parse({ ...valid, dbInstanceIdentifier: 'keyloop' })).not.toThrow();
  });

  it('accepts a numeric-string port', () => {
    expect(parse({ ...valid, port: '5432' }).port).toBe(5432);
  });

  it.each([1, 65535])('accepts boundary port %s', (port) => {
    expect(parse({ ...valid, port }).port).toBe(port);
  });

  it.each([0, 65536, -1, 5432.5, '54a', '', null, true])('rejects port %p', (port) => {
    expect(errorOf(JSON.stringify({ ...valid, port })).message).toMatch(/port must be an integer/);
  });

  it.each(['host', 'username', 'password', 'dbname'])('rejects a missing %s', (field) => {
    const secret: Record<string, unknown> = { ...valid };
    delete secret[field];
    expect(errorOf(JSON.stringify(secret)).message).toMatch(`${field} must be a non-empty string`);
  });

  it.each(['', '   ', 42])('rejects host %p', (host) => {
    expect(errorOf(JSON.stringify({ ...valid, host })).message).toMatch(/host must be/);
  });

  it('rejects a non-postgres engine', () => {
    expect(errorOf(JSON.stringify({ ...valid, engine: 'mysql' })).message).toMatch(
      /engine must be postgres/,
    );
  });

  it('rejects invalid JSON', () => {
    expect(errorOf('{"host": ').message).toBe(`DB secret "${ID}" is not valid JSON`);
  });

  it.each(['[]', '"text"', '42', 'null'])('rejects non-object JSON %s', (raw) => {
    expect(errorOf(raw).message).toBe(`DB secret "${ID}" is not a JSON object`);
  });

  it('reports every problem at once and names the secret', () => {
    const message = errorOf(JSON.stringify({ engine: 'mysql', port: 0 })).message;

    expect(message).toContain(ID);
    for (const field of ['engine', 'host', 'port', 'username', 'password', 'dbname']) {
      expect(message).toContain(field);
    }
  });

  it('never echoes values in the error message', () => {
    const message = errorOf(JSON.stringify({ ...valid, port: 'hunter2-port', host: '' })).message;

    expect(message).not.toContain('hunter2');
  });
});

describe('toPostgresUrl', () => {
  it('builds a postgresql:// URL', () => {
    expect(toPostgresUrl(parse(valid))).toBe('postgresql://keyloop:hunter2@localhost:7001/keyloop');
  });

  it('percent-encodes credentials and the database name', () => {
    const url = toPostgresUrl({
      ...parse(valid),
      username: 'app@x',
      password: 'p@ss:/w#rd?',
      dbname: 'my db',
    });

    expect(url).toBe('postgresql://app%40x:p%40ss%3A%2Fw%23rd%3F@localhost:7001/my%20db');
    const parsed = new URL(url);
    expect(decodeURIComponent(parsed.password)).toBe('p@ss:/w#rd?');
    expect(parsed.port).toBe('7001');
  });
});
