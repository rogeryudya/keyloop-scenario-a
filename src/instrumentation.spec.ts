import { isTelemetryEnabled, startTelemetry } from './instrumentation';

describe('isTelemetryEnabled', () => {
  it.each<[string, NodeJS.ProcessEnv, boolean]>([
    ['no endpoint', {}, false],
    ['blank endpoint', { OTEL_EXPORTER_OTLP_ENDPOINT: '' }, false],
    ['OTLP endpoint', { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318' }, true],
    ['traces-only endpoint', { OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://x/v1/traces' }, true],
    [
      'blank endpoint, traces endpoint set',
      { OTEL_EXPORTER_OTLP_ENDPOINT: '', OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: 'http://x/v1/traces' },
      true,
    ],
    [
      'SDK disabled',
      { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://localhost:4318', OTEL_SDK_DISABLED: 'true' },
      false,
    ],
  ])('%s → %p', (_case, env, enabled) => {
    expect(isTelemetryEnabled(env)).toBe(enabled);
  });
});

describe('startTelemetry', () => {
  it('is a no-op when disabled', async () => {
    await expect(startTelemetry({ NODE_ENV: 'test' }).shutdown()).resolves.toBeUndefined();
  });
});
