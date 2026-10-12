import { BookingMetrics } from '../../src/modules/appointments/application/ports/booking-metrics';

/** Records what the handler reported, for assertions. */
export class RecordingBookingMetrics extends BookingMetrics {
  created = 0;
  conflictRetries = 0;
  readonly rejections: string[] = [];

  appointmentCreated(): void {
    this.created += 1;
  }

  bookingRejected(reason: string): void {
    this.rejections.push(reason);
  }

  conflictRetried(): void {
    this.conflictRetries += 1;
  }
}
