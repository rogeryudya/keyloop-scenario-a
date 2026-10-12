import { ValidationPipe } from '@nestjs/common';
import { RequestValidationError } from './request-validation.error';

/** Shape validation for every DTO (docs/conventions.md › Validation). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => RequestValidationError.fromClassValidator(errors),
  });
}
