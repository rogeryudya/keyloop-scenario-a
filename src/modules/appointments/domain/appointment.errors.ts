import { BusinessRuleError } from '../../../shared/domain/errors';

/** BR-3. */
export class AppointmentInPastError extends BusinessRuleError {
  constructor() {
    super('APPOINTMENT_IN_PAST', 'Appointment start time must be in the future', [
      { field: 'start', issue: 'must be in the future' },
    ]);
  }
}

/** BR-12. */
export class AppointmentNotCancellableError extends BusinessRuleError {
  constructor() {
    super('APPOINTMENT_NOT_CANCELLABLE', 'Only a confirmed appointment can be cancelled');
  }
}
