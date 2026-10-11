import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from './domain-error';

class SampleNotFoundError extends NotFoundError {
  constructor() {
    super('SAMPLE_NOT_FOUND', 'Sample not found');
  }
}

class SampleRuleError extends BusinessRuleError {
  constructor() {
    super('SAMPLE_RULE', 'Rule broken', [{ field: 'start', issue: 'must be in the future' }]);
  }
}

describe('DomainError hierarchy', () => {
  it('carries code, message and empty details by default', () => {
    const error = new SampleNotFoundError();

    expect(error.code).toBe('SAMPLE_NOT_FOUND');
    expect(error.message).toBe('Sample not found');
    expect(error.details).toEqual([]);
  });

  it('carries details when given', () => {
    expect(new SampleRuleError().details).toEqual([
      { field: 'start', issue: 'must be in the future' },
    ]);
  });

  it('is an Error and a DomainError of the right category only', () => {
    const error = new SampleNotFoundError();

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error).not.toBeInstanceOf(ConflictError);
    expect(error).not.toBeInstanceOf(ValidationError);
    expect(error).not.toBeInstanceOf(BusinessRuleError);
  });

  it('uses the concrete class name as error name', () => {
    expect(new SampleRuleError().name).toBe('SampleRuleError');
  });
});
