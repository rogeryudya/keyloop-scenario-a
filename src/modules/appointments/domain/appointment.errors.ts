import { BusinessRuleError, ConflictError } from '../../../shared/domain/errors';

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

/** BR-6. */
export class ServiceTypeNotSupportedError extends BusinessRuleError {
  constructor() {
    super(
      'SERVICE_TYPE_NOT_SUPPORTED',
      'No technician at this dealership is qualified for the service type',
      [{ field: 'serviceTypeId', issue: 'not offered by this dealership' }],
    );
  }
}

/** BR-7. */
export class NoServiceBayAvailableError extends ConflictError {
  constructor() {
    super('NO_SERVICE_BAY_AVAILABLE', 'No service bay is free for the whole requested slot');
  }
}

/** BR-8. */
export class NoTechnicianAvailableError extends ConflictError {
  constructor() {
    super(
      'NO_TECHNICIAN_AVAILABLE',
      'No qualified technician is free for the whole requested slot',
    );
  }
}
