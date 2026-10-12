// Must stay the first import: tracing patches modules before anything else loads them.
import { telemetry } from './instrumentation';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule, { bufferLogs: true }));
  // Nest's own logs (startup, exception filter) go through pino as JSON, with the request id.
  app.useLogger(app.get(Logger));
  // On SIGTERM/SIGINT: close the app (runs onModuleDestroy, e.g. Prisma disconnect), then flush
  // pending spans before exiting.
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => {
      void app
        .close()
        .then(() => telemetry.shutdown())
        .finally(() => process.exit(0));
    });
  }
  await app.listen(app.get(AppConfig).port);
}

void bootstrap();
