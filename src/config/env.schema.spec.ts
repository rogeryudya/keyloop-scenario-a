import { InvalidEnvironmentError, NodeEnv, validateEnv } from './env.schema';

const DB_URL = 'postgresql://keyloop:s3cret@localhost:5432/keyloop';

function problemsOf(raw: Record<string, string | undefined>): readonly string[] {
  try {
    validateEnv(raw);
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) return error.problems;
    throw error;
  }
  throw new Error('expected validateEnv to throw');
}

describe('validateEnv', () => {
  it('applies defaults when only a DB source is given', () => {
    const env = validateEnv({ DATABASE_URL: DB_URL });

    expect(env.NODE_ENV).toBe(NodeEnv.Development);
    expect(env.PORT).toBe(3000);
    expect(env.DATABASE_URL).toBe(DB_URL);
    expect(env.DB_SECRET_ID).toBeUndefined();
  });

  it('converts PORT from string to number', () => {
    expect(validateEnv({ DATABASE_URL: DB_URL, PORT: '8080' }).PORT).toBe(8080);
  });

  it.each(['1', '65535'])('accepts boundary PORT %s', (port) => {
    expect(validateEnv({ DATABASE_URL: DB_URL, PORT: port }).PORT).toBe(Number(port));
  });

  it.each(['0', '65536', '-1', '80.5', 'abc'])('rejects PORT %s', (port) => {
    expect(problemsOf({ DATABASE_URL: DB_URL, PORT: port }).join()).toMatch(/PORT/);
  });

  it('treats an empty value as unset', () => {
    expect(validateEnv({ DATABASE_URL: DB_URL, PORT: '' }).PORT).toBe(3000);
  });

  it.each(Object.values(NodeEnv))('accepts NODE_ENV %s', (nodeEnv) => {
    expect(validateEnv({ DATABASE_URL: DB_URL, NODE_ENV: nodeEnv }).NODE_ENV).toBe(nodeEnv);
  });

  it('rejects an unknown NODE_ENV', () => {
    expect(problemsOf({ DATABASE_URL: DB_URL, NODE_ENV: 'staging' }).join()).toMatch(/NODE_ENV/);
  });

  it('requires DB_SECRET_ID or DATABASE_URL', () => {
    expect(problemsOf({})).toContain('one of DB_SECRET_ID or DATABASE_URL must be set');
    expect(problemsOf({ DATABASE_URL: '', DB_SECRET_ID: '' })).toContain(
      'one of DB_SECRET_ID or DATABASE_URL must be set',
    );
  });

  it('accepts DB_SECRET_ID alone', () => {
    expect(validateEnv({ DB_SECRET_ID: 'keyloop/local/db' }).DB_SECRET_ID).toBe('keyloop/local/db');
  });

  it.each(['mysql://u:p@h/db', 'localhost:5432', 'postgres://'])(
    'rejects non-postgres DATABASE_URL %s',
    (url) => {
      expect(problemsOf({ DATABASE_URL: url }).join()).toMatch(/DATABASE_URL/);
    },
  );

  it('accepts both postgres:// and postgresql:// schemes', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgres://u:p@h:5432/db' })).not.toThrow();
    expect(() => validateEnv({ DATABASE_URL: DB_URL })).not.toThrow();
  });

  it('reports every problem at once', () => {
    const problems = problemsOf({ PORT: 'abc', NODE_ENV: 'staging' }).join('\n');

    expect(problems).toMatch(/PORT/);
    expect(problems).toMatch(/NODE_ENV/);
    expect(problems).toMatch(/DB_SECRET_ID or DATABASE_URL/);
  });

  it('never echoes values in the error message', () => {
    const leaky = 'mysql://admin:hunter2@db/prod';
    expect(() => validateEnv({ DATABASE_URL: leaky })).toThrow(InvalidEnvironmentError);
    expect(problemsOf({ DATABASE_URL: leaky }).join()).not.toContain('hunter2');
  });

  it('ignores unrelated variables', () => {
    expect(() =>
      validateEnv({ DATABASE_URL: DB_URL, PATH: '/usr/bin', HOME: '/root' }),
    ).not.toThrow();
  });
});
