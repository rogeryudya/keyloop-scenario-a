import { ValidationError } from '../../domain/errors';

export class InvalidCursorError extends ValidationError {
  constructor() {
    super('INVALID_CURSOR', 'The pagination cursor is invalid', [
      { field: 'cursor', issue: 'is not a cursor returned by this API' },
    ]);
  }
}
