import { AppConfig } from './app-config';
import { DbCredentialsProvider } from './db-credentials.provider';
import { EnvironmentVariables } from './env.schema';
import { InvalidDbSecretError } from './rds-secret';
import { SecretNotFoundError, SecretSource } from './secret-source';

/** In-memory secrets; records every read so caching can be asserted. */
class FakeSecretSource extends SecretSource {
  readonly reads: string[] = [];

  constructor(private readonly secrets: Record<string, string> = {}) {
    super();
  }

  getSecretString(secretId: string): Promise<string> {
    this.reads.push(secretId);
    const secret = this.secrets[secretId];
    return secret === undefined
      ? Promise.reject(new SecretNotFoundError(secretId))
      : Promise.resolve(secret);
  }
}

const SECRET_ID = 'keyloop/local/db';
const rdsSecret = JSON.stringify({
  engine: 'postgres',
  host: 'localhost',
  port: 7001,
  username: 'keyloop',
  password: 's3cret',
  dbname: 'keyloop',
});

function providerWith(
  env: Partial<EnvironmentVariables>,
  secrets = new FakeSecretSource(),
): DbCredentialsProvider {
  return new DbCredentialsProvider(
    new AppConfig(Object.assign(new EnvironmentVariables(), env)),
    secrets,
  );
}

describe('DbCredentialsProvider', () => {
  const url = 'postgresql://keyloop:keyloop@localhost:5432/keyloop';

  it('returns DATABASE_URL as-is', async () => {
    await expect(providerWith({ DATABASE_URL: url }).getDatabaseUrl()).resolves.toBe(url);
  });

  it('builds the URL from the Secrets Manager secret', async () => {
    const provider = providerWith(
      { DB_SECRET_ID: SECRET_ID },
      new FakeSecretSource({ [SECRET_ID]: rdsSecret }),
    );

    await expect(provider.getDatabaseUrl()).resolves.toBe(
      'postgresql://keyloop:s3cret@localhost:7001/keyloop',
    );
  });

  it('prefers DB_SECRET_ID over DATABASE_URL', async () => {
    const provider = providerWith(
      { DB_SECRET_ID: SECRET_ID, DATABASE_URL: url },
      new FakeSecretSource({ [SECRET_ID]: rdsSecret }),
    );

    await expect(provider.getDatabaseUrl()).resolves.toContain('@localhost:7001/');
  });

  it('does not read Secrets Manager in DATABASE_URL mode', async () => {
    const secrets = new FakeSecretSource();
    await providerWith({ DATABASE_URL: url }, secrets).getDatabaseUrl();

    expect(secrets.reads).toEqual([]);
  });

  it('reads the secret once and caches the URL', async () => {
    const secrets = new FakeSecretSource({ [SECRET_ID]: rdsSecret });
    const provider = providerWith({ DB_SECRET_ID: SECRET_ID }, secrets);

    const [first, second] = await Promise.all([
      provider.getDatabaseUrl(),
      provider.getDatabaseUrl(),
    ]);
    await provider.getDatabaseUrl();

    expect(first).toBe(second);
    expect(secrets.reads).toEqual([SECRET_ID]);
  });

  it('rejects when the secret does not exist', async () => {
    await expect(providerWith({ DB_SECRET_ID: SECRET_ID }).getDatabaseUrl()).rejects.toThrow(
      SecretNotFoundError,
    );
  });

  it('rejects a malformed secret without leaking its content', async () => {
    const provider = providerWith(
      { DB_SECRET_ID: SECRET_ID },
      new FakeSecretSource({ [SECRET_ID]: '{"password":"s3cret"}' }),
    );

    const error = await provider.getDatabaseUrl().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidDbSecretError);
    expect((error as Error).message).toContain(SECRET_ID);
    expect((error as Error).message).not.toContain('s3cret');
  });

  it('rejects when no DB source is configured', async () => {
    await expect(providerWith({}).getDatabaseUrl()).rejects.toThrow(/No DB credentials/);
  });
});
