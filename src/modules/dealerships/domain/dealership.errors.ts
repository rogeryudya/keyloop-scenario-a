import { NotFoundError } from '../../../shared/domain/errors';

/** BR-13. */
export class DealershipNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('DEALERSHIP_NOT_FOUND', 'Dealership not found', [
      { field: 'id', issue: `no dealership ${id}` },
    ]);
  }
}
