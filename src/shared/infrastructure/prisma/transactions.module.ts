import { ClsPluginTransactional, TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { ClsModule } from 'nestjs-cls';
import { PrismaModule } from './prisma.module';
import { PrismaService } from './prisma.service';

export type PrismaTransactionalAdapter = TransactionalAdapterPrisma<PrismaService>;

/**
 * Inject this in repositories and use `txHost.tx`: inside a `@Transactional()` handler it is the
 * transaction client, outside one it is the plain client. Repositories never inject PrismaService.
 */
export type PrismaTransactionHost = TransactionHost<PrismaTransactionalAdapter>;

/**
 * One command = one transaction: handlers put `@Transactional()` on `execute` (docs/architecture/application.md).
 * `@Transactional()` opens its own CLS context when none is active, so no HTTP middleware is required.
 */
export const TransactionsModule = ClsModule.forRoot({
  global: true,
  plugins: [
    new ClsPluginTransactional({
      imports: [PrismaModule],
      adapter: new TransactionalAdapterPrisma<PrismaService>({
        prismaInjectionToken: PrismaService,
        // Enables Propagation.Nested (savepoints); must match the schema's datasource provider.
        sqlFlavor: 'postgresql',
      }),
    }),
  ],
});
