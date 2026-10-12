import { INestApplication, VersioningType } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ErrorResponseDto } from './shared/presentation/dto/error-response.dto';
import { GlobalExceptionFilter } from './shared/presentation/filters/global-exception.filter';
import { createValidationPipe } from './shared/presentation/validation/validation.pipe';

/**
 * HTTP setup shared by `main.ts` and the e2e app factory, so tests exercise the real pipeline:
 * URI versioning (`/v1/...`), shape validation, the standard error format and Swagger at `/docs`.
 */
export function configureApp(app: INestApplication): INestApplication {
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter(app.get(HttpAdapterHost)));

  const config = new DocumentBuilder()
    .setTitle('Keyloop Service Booking API')
    .setDescription('Service appointment booking for dealerships. Errors use ErrorResponseDto.')
    .setVersion('1')
    .build();
  const document = SwaggerModule.createDocument(app, config, { extraModels: [ErrorResponseDto] });
  SwaggerModule.setup('docs', app, document);

  return app;
}
