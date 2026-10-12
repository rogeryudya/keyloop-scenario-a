import { Injectable } from '@nestjs/common';
import { Counter, metrics } from '@opentelemetry/api';
import { BookingMetrics } from '../application/ports/booking-metrics';

export const METER_NAME = 'keyloop.appointments';

/**
 * OpenTelemetry counters. Prometheus (otel-lgtm) adds the `_total` suffix, so they show up as
 * `appointments_created_total`, `appointment_rejections_total{reason}` and
 * `appointment_conflict_retries_total`. With telemetry off the global meter is a no-op.
 */
@Injectable()
export class OtelBookingMetrics extends BookingMetrics {
  private readonly created: Counter;
  private readonly rejections: Counter;
  private readonly conflictRetries: Counter;

  constructor() {
    super();
    const meter = metrics.getMeter(METER_NAME);
    this.created = meter.createCounter('appointments_created', {
      description: 'Appointments confirmed (idempotent replays excluded)',
    });
    this.rejections = meter.createCounter('appointment_rejections', {
      description: 'Booking requests refused for a business reason, by error code',
    });
    this.conflictRetries = meter.createCounter('appointment_conflict_retries', {
      description: 'Booking attempts retried after losing a race on the database constraint',
    });
  }

  appointmentCreated(): void {
    this.created.add(1);
  }

  bookingRejected(reason: string): void {
    this.rejections.add(1, { reason });
  }

  conflictRetried(): void {
    this.conflictRetries.add(1);
  }
}
