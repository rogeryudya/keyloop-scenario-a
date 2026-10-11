import type { ValidationError as ClassValidatorError } from 'class-validator';
import { ErrorDetail, ValidationError } from '../../domain/errors';

/** A request DTO failed `class-validator`. Raised by the global ValidationPipe; HTTP 400. */
export class RequestValidationError extends ValidationError {
  constructor(details: readonly ErrorDetail[]) {
    super('VALIDATION_FAILED', 'Request validation failed', details);
  }

  static fromClassValidator(errors: readonly ClassValidatorError[]): RequestValidationError {
    return new RequestValidationError(toErrorDetails(errors));
  }
}

/** Flattens class-validator's tree into `{ field, issue }` pairs; nested fields use dotted paths. */
export function toErrorDetails(
  errors: readonly ClassValidatorError[],
  parentPath = '',
): ErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((issue) => ({ field, issue }));
    return [...own, ...toErrorDetails(error.children ?? [], field)];
  });
}
