import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = configureApp(await NestFactory.create(AppModule));
  // Runs onModuleDestroy (e.g. Prisma disconnect) on SIGTERM/SIGINT.
  app.enableShutdownHooks();
  await app.listen(app.get(AppConfig).port);
}

void bootstrap();
