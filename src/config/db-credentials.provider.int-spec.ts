import {
  CreateSecretCommand,
  CreateSecretCommandInput,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { Test } from '@nestjs/testing';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { PrismaModule } from '../shared/infrastructure/prisma/prisma.module';
import { PrismaService } from '../shared/infrastructure/prisma/prisma.service';
import { AppConfigModule } from './config.module';
import { DbCredentialsProvider } from './db-credentials.provider';
import { loadAppConfig } from './load-env';
import { InvalidDbSecretError } from './rds-secret';
import { SecretNotFoundError, SecretsManagerSecretSource } from './secret-source';

/** Same image as the `floci` service in docker-compose.yml. */
const FLOCI_IMAGE = 'floci/floci:2.2.0';
const REGION = 'us-east-1';
/** floci dummies, read by the AWS SDK credential chain. */
const AWS_CREDENTIALS = { AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test' };

// Opt-out for environments where Testcontainers can't start extra containers.
const describeFloci = process.env.SKIP_FLOCI_TESTS === '1' ? describe.skip : describe;

describeFloci('DbCredentialsProvider with floci Secrets Manager', () => {
  let floci: StartedTestContainer;
  let endpoint: string;
  let secrets: SecretsManagerClient;
  /** The Testcontainers Postgres from global-setup, as RDS secret fields. */
  let postgres: { host: string; port: number; username: string; password: string; dbname: string };
  const savedEnv = { ...process.env };

  beforeAll(async () => {
    floci = await new GenericContainer(FLOCI_IMAGE)
      .withExposedPorts(4566)
      .withEnvironment({ FLOCI_SERVICES_UI_ENABLED: 'false' })
      .withWaitStrategy(Wait.forHttp('/_floci/health', 4566).forStatusCode(200))
      .withStartupTimeout(60_000)
      .start();
    endpoint = `http://${floci.getHost()}:${floci.getMappedPort(4566)}`;
    Object.assign(process.env, AWS_CREDENTIALS);
    secrets = new SecretsManagerClient({ region: REGION, endpoint });

    const url = new URL(savedEnv.DATABASE_URL ?? '');
    postgres = {
      host: url.hostname,
      port: Number(url.port),
      username: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      dbname: url.pathname.slice(1),
    };
  }, 90_000);

  afterAll(async () => {
    process.env = savedEnv;
    secrets?.destroy();
    await floci?.stop();
  });

  afterEach(() => {
    process.env = { ...savedEnv, ...AWS_CREDENTIALS };
  });

  let secretCounter = 0;
  async function createSecret(input: Omit<CreateSecretCommandInput, 'Name'>): Promise<string> {
    const name = `keyloop/test-${++secretCounter}/db`;
    await secrets.send(new CreateSecretCommand({ Name: name, ...input }));
    return name;
  }

  function rdsSecret(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({ engine: 'postgres', ...postgres, ...overrides });
  }

  function providerFor(secretId: string, awsEndpoint = endpoint): DbCredentialsProvider {
    const config = loadAppConfig({
      NODE_ENV: 'test',
      DB_SECRET_ID: secretId,
      AWS_REGION: REGION,
      AWS_ENDPOINT_URL: awsEndpoint,
    });
    return new DbCredentialsProvider(config, SecretsManagerSecretSource.fromConfig(config));
  }

  it('boots PrismaModule with credentials from the secret and reaches the DB', async () => {
    const secretId = await createSecret({ SecretString: rdsSecret() });
    process.env.DB_SECRET_ID = secretId;
    process.env.AWS_REGION = REGION;
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.DATABASE_URL = 'postgresql://wrong:wrong@127.0.0.1:1/ignored'; // DB_SECRET_ID wins

    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule],
    }).compile();
    try {
      const prisma = moduleRef.get(PrismaService);
      const [row] = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
      expect(row?.db).toBe(postgres.dbname);
    } finally {
      await moduleRef.close();
    }
  });

  it('builds the URL from the RDS-format secret', async () => {
    const secretId = await createSecret({ SecretString: rdsSecret() });

    const url = new URL(await providerFor(secretId).getDatabaseUrl());

    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe(postgres.host);
    expect(Number(url.port)).toBe(postgres.port);
    expect(decodeURIComponent(url.username)).toBe(postgres.username);
    expect(decodeURIComponent(url.password)).toBe(postgres.password);
    expect(url.pathname).toBe(`/${postgres.dbname}`);
  });

  it('fails clearly when the secret does not exist', async () => {
    const result = providerFor('keyloop/missing/db').getDatabaseUrl();

    await expect(result).rejects.toThrow(SecretNotFoundError);
    await expect(result).rejects.toThrow('DB secret "keyloop/missing/db" not found');
  });

  it('fails clearly on malformed JSON', async () => {
    const secretId = await createSecret({ SecretString: '{"host": "localhost", ' });

    await expect(providerFor(secretId).getDatabaseUrl()).rejects.toThrow(
      new InvalidDbSecretError(`DB secret "${secretId}" is not valid JSON`),
    );
  });

  it('fails clearly on missing fields without echoing the secret', async () => {
    const secretId = await createSecret({
      SecretString: JSON.stringify({ engine: 'postgres', password: 'do-not-leak' }),
    });

    const error = await providerFor(secretId)
      .getDatabaseUrl()
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidDbSecretError);
    expect((error as Error).message).toMatch(/host must be a non-empty string/);
    expect((error as Error).message).toMatch(/port must be an integer/);
    expect((error as Error).message).not.toContain('do-not-leak');
  });

  it('rejects a binary secret', async () => {
    const secretId = await createSecret({ SecretBinary: Buffer.from(rdsSecret()) });

    await expect(providerFor(secretId).getDatabaseUrl()).rejects.toThrow(/has no SecretString/);
  });

  it('fails clearly when Secrets Manager is unreachable', async () => {
    // Port 1 on localhost: connection refused, no listener.
    await expect(
      providerFor('keyloop/local/db', 'http://127.0.0.1:1').getDatabaseUrl(),
    ).rejects.toThrow(/Could not read DB secret "keyloop\/local\/db" from Secrets Manager/);
  }, 30_000);
});
