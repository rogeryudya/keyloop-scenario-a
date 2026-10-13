import { Injectable, OnModuleInit } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { Span, SpanStatusCode, trace, Tracer } from '@opentelemetry/api';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors';

export const TRACER_NAME = 'keyloop.cqrs';

type MessageKind = 'command' | 'query';

/** How a handler run ended. Business rejections are expected outcomes, not span errors. */
export type HandlerOutcome =
  'success' | 'invalid' | 'not_found' | 'conflict' | 'rejected' | 'error';

export function outcomeOf(error: unknown): HandlerOutcome {
  if (error instanceof ConflictError) return 'conflict';
  if (error instanceof NotFoundError) return 'not_found';
  if (error instanceof ValidationError) return 'invalid';
  if (error instanceof BusinessRuleError) return 'rejected';
  return 'error';
}

/** `CreateAppointmentCommand` → `CreateAppointment`, so span names read `command CreateAppointment`. */
const messageName = (message: object, kind: MessageKind): string => {
  const name = message.constructor.name;
  const suffix = kind === 'command' ? 'Command' : 'Query';
  return name.endsWith(suffix) && name !== suffix ? name.slice(0, -suffix.length) : name;
};

async function traced<R>(
  tracer: Tracer,
  kind: MessageKind,
  message: object,
  run: () => Promise<R>,
): Promise<R> {
  const name = messageName(message, kind);
  return tracer.startActiveSpan(
    `${kind} ${name}`,
    { attributes: { 'cqrs.kind': kind, 'cqrs.name': name } },
    async (span: Span) => {
      try {
        const result = await run();
        span.setAttribute('outcome', 'success');
        return result;
      } catch (error) {
        const outcome = outcomeOf(error);
        span.setAttribute('outcome', outcome);
        if (error instanceof DomainError) {
          // Only the stable code: messages and details may carry request data.
          span.setAttribute('error.code', error.code);
        } else {
          span.recordException(error instanceof Error ? error : String(error));
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
        throw error;
      } finally {
        span.end();
      }
    },
  );
}

/**
 * Cross-cutting "pipeline behaviour" for the mediator (docs/architecture/application.md): wraps
 * `CommandBus.execute` / `QueryBus.execute` once at startup so every handler run gets a span with
 * its outcome, with no tracing code in handlers. A no-op tracer is used when telemetry is off.
 */
@Injectable()
export class HandlerTracing implements OnModuleInit {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  onModuleInit(): void {
    const tracer = trace.getTracer(TRACER_NAME);
    const command = this.commandBus.execute.bind(this.commandBus);
    const query = this.queryBus.execute.bind(this.queryBus);
    // The bus methods are overloaded; the wrapper keeps their runtime contract (same args, same result).
    this.commandBus.execute = ((...args: Parameters<typeof command>) =>
      traced(tracer, 'command', args[0], () => command(...args))) as typeof command;
    this.queryBus.execute = ((...args: Parameters<typeof query>) =>
      traced(tracer, 'query', args[0], () => query(...args))) as typeof query;
  }
}
