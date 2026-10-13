import { metrics } from '@opentelemetry/api';
import { DataPointType, MeterProvider, MetricReader } from '@opentelemetry/sdk-metrics';
import { OtelBookingMetrics } from './otel-booking-metrics';

/** Pull-based reader: `collect()` returns the current values on demand. */
class TestReader extends MetricReader {
  protected onShutdown(): Promise<void> {
    return Promise.resolve();
  }

  protected onForceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

describe('OtelBookingMetrics', () => {
  let reader: TestReader;

  beforeEach(() => {
    reader = new TestReader();
    metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));
  });

  afterEach(() => metrics.disable());

  /** Sum per attribute set of one counter, e.g. `{ '{"reason":"X"}': 2 }`. */
  const sums = async (name: string): Promise<Record<string, number>> => {
    const { resourceMetrics } = await reader.collect();
    const metric = resourceMetrics.scopeMetrics
      .flatMap((s) => s.metrics)
      .find((m) => m.descriptor.name === name);
    if (metric?.dataPointType !== DataPointType.SUM) return {};
    return Object.fromEntries(
      metric.dataPoints.map((p) => [JSON.stringify(p.attributes), p.value]),
    );
  };

  it('counts created appointments', async () => {
    const counters = new OtelBookingMetrics();
    counters.appointmentCreated();
    counters.appointmentCreated();

    expect(await sums('appointments_created')).toEqual({ '{}': 2 });
  });

  it('counts rejections per reason', async () => {
    const counters = new OtelBookingMetrics();
    counters.bookingRejected('NO_SERVICE_BAY_AVAILABLE');
    counters.bookingRejected('NO_SERVICE_BAY_AVAILABLE');
    counters.bookingRejected('OUTSIDE_OPENING_HOURS');

    expect(await sums('appointment_rejections')).toEqual({
      '{"reason":"NO_SERVICE_BAY_AVAILABLE"}': 2,
      '{"reason":"OUTSIDE_OPENING_HOURS"}': 1,
    });
  });

  it('counts conflict retries', async () => {
    new OtelBookingMetrics().conflictRetried();

    expect(await sums('appointment_conflict_retries')).toEqual({ '{}': 1 });
  });
});
