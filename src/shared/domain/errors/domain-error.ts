/** One problem with a specific input. Mirrors `error.details[]` in the API error format. */
export interface ErrorDetail {
  readonly field?: string;
  readonly issue: string;
}

/**
 * Base of every expected business failure. `code` is a stable UPPER_SNAKE_CASE identifier clients
 * can switch on. The HTTP status is decided by the exception filter from the subclass, never here.
 */
export abstract class DomainError extends Error {
  protected constructor(
    readonly code: string,
    message: string,
    readonly details: readonly ErrorDetail[] = [],
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Input is malformed in a way only the domain can tell (e.g. invalid cursor). HTTP 400. */
export abstract class ValidationError extends DomainError {}

/** A referenced resource doesn't exist. HTTP 404. */
export abstract class NotFoundError extends DomainError {}

/** The request clashes with current state (e.g. slot already taken). HTTP 409. */
export abstract class ConflictError extends DomainError {}

/** A business rule rejects an otherwise well-formed request. HTTP 422. */
export abstract class BusinessRuleError extends DomainError {}
