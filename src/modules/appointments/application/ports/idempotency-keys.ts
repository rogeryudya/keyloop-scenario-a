/** A key used on a successful booking (FR-11, A-16). */
export interface IdempotencyRecord {
  readonly key: string;
  /** Hash of the normalised request; see CreateAppointmentHandler. */
  readonly requestHash: string;
  readonly appointmentId: string;
  readonly createdAt: Date;
}

/**
 * Storage for `Idempotency-Key`s (ADR-0007). Joins the caller's transaction, so a key is stored if and
 * only if its appointment is. Also the DI token.
 */
export abstract class IdempotencyKeys {
  abstract find(key: string): Promise<IdempotencyRecord | null>;

  /**
   * Throws `AppointmentConflictError` when a concurrent request committed the same key first: the
   * handler's retry then finds that record and replays it.
   */
  abstract save(record: IdempotencyRecord): Promise<void>;
}
