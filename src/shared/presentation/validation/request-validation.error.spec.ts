import type { ValidationError as ClassValidatorError } from 'class-validator';
import { RequestValidationError, toErrorDetails } from './request-validation.error';

const error = (
  property: string,
  constraints?: Record<string, string>,
  children: ClassValidatorError[] = [],
): ClassValidatorError => ({ property, constraints, children });

describe('toErrorDetails', () => {
  it('returns one detail per failed constraint', () => {
    expect(
      toErrorDetails([
        error('email', { isEmail: 'email must be an email', isNotEmpty: 'email is empty' }),
      ]),
    ).toEqual([
      { field: 'email', issue: 'email must be an email' },
      { field: 'email', issue: 'email is empty' },
    ]);
  });

  it('uses dotted paths for nested errors', () => {
    const nested = error('vehicle', undefined, [
      error('vin', { length: 'vin must be 17 characters' }),
    ]);

    expect(toErrorDetails([nested])).toEqual([
      { field: 'vehicle.vin', issue: 'vin must be 17 characters' },
    ]);
  });

  it('returns nothing for no errors', () => {
    expect(toErrorDetails([])).toEqual([]);
  });
});

describe('RequestValidationError', () => {
  it('has code VALIDATION_FAILED and flattened details', () => {
    const result = RequestValidationError.fromClassValidator([
      error('name', { isString: 'name must be a string' }),
    ]);

    expect(result.code).toBe('VALIDATION_FAILED');
    expect(result.details).toEqual([{ field: 'name', issue: 'name must be a string' }]);
  });
});
