/**
 * Business counters for booking (NFR-5). Implemented with OpenTelemetry in infrastructure, so the
 * handler stays free of telemetry libraries. Also the DI token.
 */
export abstract class BookingMetrics {
  /** A new appointment was confirmed. Idempotent replays don't count: nothing new was booked. */
  abstract appointmentCreated(): void;

  /** A booking was refused for a business reason; `reason` is the error code, e.g. `NO_SERVICE_BAY_AVAILABLE`. */
  abstract bookingRejected(reason: string): void;

  /** An attempt lost a race on the database constraint and is retried (BR-10). */
  abstract conflictRetried(): void;
}
