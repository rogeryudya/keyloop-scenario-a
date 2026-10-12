import { Transactional, TransactionHost } from '@nestjs-cls/transactional';
import { INestApplicationContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppConfigModule } from '../../../config/config.module';
import { DbCredentialsProvider } from '../../../config/db-credentials.provider';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';
import { PrismaTransactionHost, TransactionsModule } from './transactions.module';

class ProbeWriter {
  constructor(private readonly txHost: PrismaTransactionHost) {}

  @Transactional()
  async write(value: string, fail: boolean): Promise<void> {
    await this.txHost.tx.$executeRaw`INSERT INTO tx_probe (v) VALUES (${value})`;
    if (fail) throw new Error('fail after write');
  }
}

describe('PrismaModule (int)', () => {
  let context: INestApplicationContext;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule, PrismaModule, TransactionsModule],
    }).compile();
    context = await moduleRef.init();
    prisma = context.get(PrismaService);
    await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS tx_probe (v text NOT NULL)`;
  });

  beforeEach(async () => {
    await prisma.$executeRaw`TRUNCATE tx_probe`;
  });

  afterAll(async () => {
    await prisma.$executeRaw`DROP TABLE IF EXISTS tx_probe`;
    await context.close();
  });

  const values = async (): Promise<string[]> =>
    (await prisma.$queryRaw<{ v: string }[]>`SELECT v FROM tx_probe ORDER BY v`).map((r) => r.v);

  it('connects to the database from DATABASE_URL', async () => {
    await expect(prisma.$queryRaw`SELECT 1 AS one`).resolves.toEqual([{ one: 1 }]);
  });

  it('commits a @Transactional() method that succeeds', async () => {
    const writer = new ProbeWriter(context.get<PrismaTransactionHost>(TransactionHost));

    await writer.write('committed', false);

    expect(await values()).toEqual(['committed']);
  });

  it('rolls back every write of a @Transactional() method that throws', async () => {
    const writer = new ProbeWriter(context.get<PrismaTransactionHost>(TransactionHost));

    await expect(writer.write('rolled-back', true)).rejects.toThrow('fail after write');

    expect(await values()).toEqual([]);
  });

  it('fails module init quickly when the database is unreachable', async () => {
    const started = Date.now();
    const failing = Test.createTestingModule({ imports: [AppConfigModule, PrismaModule] })
      .overrideProvider(DbCredentialsProvider)
      .useValue({ getDatabaseUrl: () => Promise.resolve('postgresql://u:p@127.0.0.1:1/none') })
      .compile();

    await expect(failing).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(10_000);
  });
});
