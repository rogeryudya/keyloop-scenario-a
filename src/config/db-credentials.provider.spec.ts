import { AppConfig } from './app-config';
import { DbCredentialsProvider } from './db-credentials.provider';
import { EnvironmentVariables } from './env.schema';

function providerWith(env: Partial<EnvironmentVariables>): DbCredentialsProvider {
  return new DbCredentialsProvider(new AppConfig(Object.assign(new EnvironmentVariables(), env)));
}

describe('DbCredentialsProvider', () => {
  const url = 'postgresql://keyloop:keyloop@localhost:5432/keyloop';

  it('returns DATABASE_URL as-is', async () => {
    await expect(providerWith({ DATABASE_URL: url }).getDatabaseUrl()).resolves.toBe(url);
  });

  it('rejects Secrets Manager mode until it is implemented', async () => {
    await expect(
      providerWith({ DB_SECRET_ID: 'keyloop/local/db' }).getDatabaseUrl(),
    ).rejects.toThrow(/DB_SECRET_ID/);
  });

  it('prefers DB_SECRET_ID over DATABASE_URL', async () => {
    await expect(
      providerWith({ DB_SECRET_ID: 'keyloop/local/db', DATABASE_URL: url }).getDatabaseUrl(),
    ).rejects.toThrow(/DB_SECRET_ID/);
  });

  it('rejects when no DB source is configured', async () => {
    await expect(providerWith({}).getDatabaseUrl()).rejects.toThrow(/No DB credentials/);
  });
});
