import { RequestValidationError } from '../../../shared/presentation/validation/request-validation.error';
import { parseIdempotencyKey } from './idempotency-key.decorator';

describe('parseIdempotencyKey', () => {
  it('passes an absent header through as undefined', () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
  });

  it.each([
    ['a UUID', '0b9c7a52-6a8e-4c3e-9d0f-2f7f1c1e4a10'],
    ['a single character', 'x'],
    ['255 characters', 'k'.repeat(255)],
    ['punctuation', 'order:42/retry=1'],
  ])('accepts %s', (_case, key) => {
    expect(parseIdempotencyKey(key)).toBe(key);
  });

  it.each([
    ['an empty value', ''],
    ['256 characters', 'k'.repeat(256)],
    ['a space', 'two words'],
    ['non-ASCII', 'คีย์'],
    ['a repeated header (array)', ['a', 'b']],
  ])('rejects %s with VALIDATION_FAILED on Idempotency-Key', (_case, key) => {
    let error: unknown;
    try {
      parseIdempotencyKey(key);
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(RequestValidationError);
    expect(error).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'Idempotency-Key' }],
    });
  });
});
