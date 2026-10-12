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

  it('accepts DB_SECRET_ID with AWS_REGION and no DATABASE_URL', () => {
    const env = validateEnv({ DB_SECRET_ID: 'keyloop/local/db', AWS_REGION: 'us-east-1' });

    expect(env.DB_SECRET_ID).toBe('keyloop/local/db');
    expect(env.AWS_REGION).toBe('us-east-1');
    expect(env.AWS_ENDPOINT_URL).toBeUndefined();
  });

  it('requires AWS_REGION when DB_SECRET_ID is set', () => {
    expect(problemsOf({ DB_SECRET_ID: 'keyloop/local/db' })).toContain(
      'AWS_REGION is required when DB_SECRET_ID is set',
    );
    expect(problemsOf({ DB_SECRET_ID: 'keyloop/local/db', AWS_REGION: '' })).toContain(
      'AWS_REGION is required when DB_SECRET_ID is set',
    );
  });

  it('does not require AWS_REGION with DATABASE_URL only', () => {
    expect(() => validateEnv({ DATABASE_URL: DB_URL })).not.toThrow();
  });

  it.each(['http://localhost:4566', 'http://floci:4566', 'https://secretsmanager.example.com'])(
    'accepts AWS_ENDPOINT_URL %s',
    (url) => {
      expect(validateEnv({ DATABASE_URL: DB_URL, AWS_ENDPOINT_URL: url }).AWS_ENDPOINT_URL).toBe(
        url,
      );
    },
  );

  it.each(['localhost:4566', 'ftp://floci:4566', 'not a url'])(
    'rejects AWS_ENDPOINT_URL %s',
    (url) => {
      expect(problemsOf({ DATABASE_URL: DB_URL, AWS_ENDPOINT_URL: url }).join()).toMatch(
        /AWS_ENDPOINT_URL/,
      );
    },
  );

  it('accepts an OTLP endpoint and service name', () => {
    const env = validateEnv({
      DATABASE_URL: DB_URL,
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-lgtm:4318',
      OTEL_SERVICE_NAME: 'keyloop-api',
    });

    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe('http://otel-lgtm:4318');
    expect(env.OTEL_SERVICE_NAME).toBe('keyloop-api');
  });

  it.each(['localhost:4318', 'grpc://otel:4317'])(
    'rejects OTEL_EXPORTER_OTLP_ENDPOINT %s',
    (url) => {
      expect(problemsOf({ DATABASE_URL: DB_URL, OTEL_EXPORTER_OTLP_ENDPOINT: url }).join()).toMatch(
        /OTEL_EXPORTER_OTLP_ENDPOINT/,
      );
    },
  );

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
