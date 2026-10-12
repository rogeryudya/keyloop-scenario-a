import { BusinessRuleError, ConflictError, NotFoundError } from '../../../shared/domain/errors';

/** BR-3. */
export class AppointmentInPastError extends BusinessRuleError {
  constructor() {
    super('APPOINTMENT_IN_PAST', 'Appointment start time must be in the future', [
      { field: 'start', issue: 'must be in the future' },
    ]);
  }
}

/** BR-4. */
export class OutsideOpeningHoursError extends BusinessRuleError {
  constructor() {
    super(
      'OUTSIDE_OPENING_HOURS',
      "The appointment must fall within the dealership's opening hours",
      [{ field: 'start', issue: 'service would not fit within opening hours on that day' }],
    );
  }
}

/** BR-5. */
export class VehicleNotOwnedByCustomerError extends BusinessRuleError {
  constructor() {
    super('VEHICLE_NOT_OWNED_BY_CUSTOMER', 'The vehicle does not belong to the customer', [
      { field: 'vehicleId', issue: 'not owned by the given customer' },
    ]);
  }
}

/** BR-13: a booking references a dealership, service type, customer or vehicle that doesn't exist. */
export class BookingReferenceNotFoundError extends NotFoundError {
  private constructor(code: string, what: string, field: string, id: string) {
    super(code, `${what} not found`, [{ field, issue: `no ${what.toLowerCase()} ${id}` }]);
  }

  static dealership(id: string): BookingReferenceNotFoundError {
    return new BookingReferenceNotFoundError(
      'DEALERSHIP_NOT_FOUND',
      'Dealership',
      'dealershipId',
      id,
    );
  }

  static serviceType(id: string): BookingReferenceNotFoundError {
    return new BookingReferenceNotFoundError(
      'SERVICE_TYPE_NOT_FOUND',
      'Service type',
      'serviceTypeId',
      id,
    );
  }

  static customer(id: string): BookingReferenceNotFoundError {
    return new BookingReferenceNotFoundError('CUSTOMER_NOT_FOUND', 'Customer', 'customerId', id);
  }

  static vehicle(id: string): BookingReferenceNotFoundError {
    return new BookingReferenceNotFoundError('VEHICLE_NOT_FOUND', 'Vehicle', 'vehicleId', id);
  }
}

/** BR-12. */
export class AppointmentNotCancellableError extends BusinessRuleError {
  constructor() {
    super('APPOINTMENT_NOT_CANCELLABLE', 'Only a confirmed appointment can be cancelled');
  }
}

/** BR-6. The message varies by use case; the code doesn't. */
export class ServiceTypeNotSupportedError extends BusinessRuleError {
  constructor(message = 'No technician at this dealership is qualified for the service type') {
    super('SERVICE_TYPE_NOT_SUPPORTED', message, [
      { field: 'serviceTypeId', issue: 'not offered by this dealership' },
    ]);
  }

  /** FR-7: asking for availability of a service the dealership doesn't offer. */
  static forAvailability(): ServiceTypeNotSupportedError {
    return new ServiceTypeNotSupportedError(
      'This dealership does not offer the service type, so it has no availability for it',
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

/** BR-10: the DB rejected the booking because a concurrent one took the bay or technician first. */
export class AppointmentConflictError extends ConflictError {
  constructor() {
    super('APPOINTMENT_CONFLICT', 'The slot was taken by a concurrent booking; please try again');
  }
}

/** FR-6. */
export class AppointmentNotFoundError extends NotFoundError {
  constructor(id: string) {
    super('APPOINTMENT_NOT_FOUND', 'Appointment not found', [
      { field: 'id', issue: `no appointment ${id}` },
    ]);
  }
}

/** FR-11: an `Idempotency-Key` was already used for a different booking request (A-16). */
export class IdempotencyKeyReusedError extends BusinessRuleError {
  constructor() {
    super(
      'IDEMPOTENCY_KEY_REUSED',
      'This Idempotency-Key was already used for a different booking request',
      [{ field: 'Idempotency-Key', issue: 'already used with a different request body' }],
    );
  }
}
