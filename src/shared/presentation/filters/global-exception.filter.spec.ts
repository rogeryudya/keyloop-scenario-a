import { BadRequestException, HttpException, NotFoundException } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors';
import { toHttpError } from './global-exception.filter';

class SampleValidationError extends ValidationError {
  constructor() {
    super('SAMPLE_INVALID', 'Invalid sample', [{ field: 'start', issue: 'is wrong' }]);
  }
}
class SampleNotFoundError extends NotFoundError {
  constructor() {
    super('SAMPLE_NOT_FOUND', 'Sample not found');
  }
}
class SampleConflictError extends ConflictError {
  constructor() {
    super('SAMPLE_CONFLICT', 'Sample conflict');
  }
}
class SampleRuleError extends BusinessRuleError {
  constructor() {
    super('SAMPLE_RULE', 'Sample rule broken');
  }
}
/** Extends the base directly instead of a category: a programming error, so it must become a 500. */
class UncategorisedError extends DomainError {
  constructor() {
    super('UNCATEGORISED', 'secret internal detail');
  }
}

const INTERNAL = {
  status: 500,
  body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', details: [] } },
};

describe('toHttpError', () => {
  it.each([
    [new SampleValidationError(), 400, 'SAMPLE_INVALID'],
    [new SampleNotFoundError(), 404, 'SAMPLE_NOT_FOUND'],
    [new SampleConflictError(), 409, 'SAMPLE_CONFLICT'],
    [new SampleRuleError(), 422, 'SAMPLE_RULE'],
  ])('maps %p to %i with its code', (error, status, code) => {
    const result = toHttpError(error);

    expect(result.status).toBe(status);
    expect(result.body.error.code).toBe(code);
    expect(result.body.error.message).toBe(error.message);
  });

  it('keeps domain error details', () => {
    expect(toHttpError(new SampleValidationError()).body.error.details).toEqual([
      { field: 'start', issue: 'is wrong' },
    ]);
  });

  it('maps an uncategorised DomainError to a generic 500', () => {
    expect(toHttpError(new UncategorisedError())).toEqual(INTERNAL);
  });

  it('maps Nest HTTP exceptions by status name', () => {
    const notFound = toHttpError(new NotFoundException('Cannot GET /nope'));

    expect(notFound.status).toBe(404);
    expect(notFound.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Cannot GET /nope',
      details: [],
    });
    expect(toHttpError(new BadRequestException()).body.error.code).toBe('BAD_REQUEST');
  });

  it('uses a fallback code for statuses without a name', () => {
    expect(toHttpError(new HttpException('teapot-ish', 499)).body.error.code).toBe('HTTP_499');
  });

  it('hides 5xx HTTP exception messages', () => {
    expect(toHttpError(new HttpException('db password is x', 503))).toEqual(INTERNAL);
  });

  it('maps pre-pipeline client errors carrying a 4xx status (e.g. malformed JSON)', () => {
    const parseError = Object.assign(new SyntaxError('Unexpected token'), { status: 400 });

    expect(toHttpError(parseError).status).toBe(400);
    expect(toHttpError(parseError).body.error.code).toBe('BAD_REQUEST');
  });

  it.each([
    ['a plain Error', new Error('Prisma P2002 at db.internal:5432')],
    ['an error with a 5xx status', Object.assign(new Error('x'), { status: 502 })],
    ['a thrown string', 'boom'],
    ['null', null],
  ])('maps %s to a generic 500', (_label, thrown) => {
    expect(toHttpError(thrown)).toEqual(INTERNAL);
  });
});
