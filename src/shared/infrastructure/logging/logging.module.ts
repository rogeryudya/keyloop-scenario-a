import { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import type { Options } from 'pino-http';
import { AppConfig } from '../../../config/app-config';
import { requestIdFor } from './request-id';

type LogLevel = 'info' | 'warn' | 'error';

/** 5xx is our fault (error); 4xx is the client's (warn), including expected business rejections. */
export function levelForStatus(statusCode: number, error?: Error): LogLevel {
  if (error !== undefined || statusCode >= 500) return 'error';
  if (statusCode >= 400) return 'warn';
  return 'info';
}

/**
 * pino-http options: one JSON line per request with `request_id`, method, url, status and duration.
 * Headers and bodies are never logged (they may carry personal data). `trace_id`/`span_id` are added
 * by the OTel pino instrumentation (`instrumentation.ts`), which also ships the logs to Loki.
 */
export function pinoHttpOptions(config: AppConfig): Options<IncomingMessage, ServerResponse> {
  return {
    level: config.logLevel,
    genReqId: requestIdFor,
    // Bound to the request's child logger, so every line logged during the request carries it.
    customProps: (req) => ({ request_id: req.id }),
    formatters: { level: (label) => ({ level: label }) },
    autoLogging: { ignore: (req) => req.url === '/health' },
    customLogLevel: (_req, res, error) => levelForStatus(res.statusCode, error),
    serializers: {
      req: (req: { method?: string; url?: string }) => ({ method: req.method, url: req.url }),
      res: (res: { statusCode?: number }) => ({ statusCode: res.statusCode }),
    },
  };
}

/** Structured logging for the whole app: Nest's `Logger` calls go to pino too (see `main.ts`). */
export const LoggingModule = LoggerModule.forRootAsync({
  inject: [AppConfig],
  useFactory: (config: AppConfig) => ({ pinoHttp: pinoHttpOptions(config) }),
});
