import { ClsPluginTransactional, NoOpTransactionalAdapter } from '@nestjs-cls/transactional';
import { Test } from '@nestjs/testing';
import { ClsModule } from 'nestjs-cls';

/**
 * Unit tests construct handlers by hand, but `@Transactional()` looks up a global TransactionHost at
 * call time. This registers one whose transactions are no-ops. Call in `beforeAll`; await the
 * returned function in `afterAll`. Real transaction behaviour is covered by integration tests.
 */
export async function useNoOpTransactions(): Promise<() => Promise<void>> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ClsModule.forRoot({
        plugins: [
          new ClsPluginTransactional({
            adapter: new NoOpTransactionalAdapter({ tx: {}, disableWarning: true }),
          }),
        ],
      }),
    ],
  }).compile();
  await moduleRef.init();
  return () => moduleRef.close();
}
