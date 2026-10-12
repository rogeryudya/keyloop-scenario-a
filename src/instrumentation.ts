import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { loadDotEnv } from './config/dotenv';

/**
 * OpenTelemetry tracing (docs/local-dev/observability.md). Imported first in `main.ts`, so the
 * instrumentations patch `http`, `pg` and `pino` (via require hooks) before Nest or Prisma load them.
 * No Express instrumentation: Nest 12 is ESM and imports express outside the require hook.
 * Exporter settings come from the standard `OTEL_*` env vars, read by the SDK itself.
 */
export const DEFAULT_SERVICE_NAME = 'keyloop-api';

export interface Telemetry {
  /** Flushes pending spans and logs. Call after the app has closed. */
  shutdown(): Promise<void>;
}

/** Off unless an OTLP endpoint is configured, so unit/e2e tests and plain runs export nothing. */
export function isTelemetryEnabled(env: NodeJS.ProcessEnv): boolean {
  const endpoint = env.OTEL_EXPORTER_OTLP_ENDPOINT || env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
  return env.OTEL_SDK_DISABLED !== 'true' && endpoint !== undefined && endpoint !== '';
}

export function startTelemetry(env: NodeJS.ProcessEnv = process.env): Telemetry {
  loadDotEnv(env);
  if (!isTelemetryEnabled(env)) return { shutdown: () => Promise.resolve() };

  const sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME || DEFAULT_SERVICE_NAME,
    instrumentations: [
      // Health probes run every few seconds (Compose, load balancers); tracing them is noise.
      new HttpInstrumentation({ ignoreIncomingRequestHook: (req) => req.url === '/health' }),
      new PgInstrumentation(),
      // Adds trace_id/span_id to every log line and sends the logs over OTLP (Loki in otel-lgtm).
      new PinoInstrumentation(),
    ],
  });
  sdk.start();
  return { shutdown: () => sdk.shutdown() };
}

export const telemetry = startTelemetry();
