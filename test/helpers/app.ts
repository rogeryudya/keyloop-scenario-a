import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { Clock } from '../../src/shared/domain/clock';

export interface TestAppOptions {
  /** Replace the system clock, e.g. with a FixedClock. */
  readonly clock?: Clock;
}

/**
 * The real AppModule with the same HTTP setup as main.ts (`configureApp`), against the Testcontainers
 * DB from globalSetup. Close it in `afterAll`.
 */
export async function createTestApp(options: TestAppOptions = {}): Promise<INestApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock) {
    builder = builder.overrideProvider(Clock).useValue(options.clock);
  }
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication({ logger: false }));
  await app.init();
  return app;
}
