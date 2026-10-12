import { CommandBus, CommandHandler, CqrsModule, QueryBus, QueryHandler } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { SpanStatusCode, trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../domain/errors';
import { HandlerTracing, outcomeOf } from './handler-tracing';

class SlotTakenError extends ConflictError {
  constructor() {
    super('SLOT_TAKEN', 'customer@example.com already booked this slot');
  }
}

class Missing extends NotFoundError {
  constructor() {
    super('MISSING', 'missing');
  }
}
class Malformed extends ValidationError {
  constructor() {
    super('MALFORMED', 'malformed');
  }
}
class Refused extends BusinessRuleError {
  constructor() {
    super('REFUSED', 'refused');
  }
}

class BookCommand {
  constructor(readonly fail?: 'conflict' | 'crash') {}
}

class FindQuery {}

@CommandHandler(BookCommand)
class BookHandler {
  execute({ fail }: BookCommand): Promise<{ id: string }> {
    if (fail === 'conflict') return Promise.reject(new SlotTakenError());
    if (fail === 'crash') return Promise.reject(new Error('db down'));
    return Promise.resolve({ id: 'a-1' });
  }
}

@QueryHandler(FindQuery)
class FindHandler {
  execute(): Promise<string[]> {
    return Promise.resolve(['x']);
  }
}

describe('HandlerTracing', () => {
  const exporter = new InMemorySpanExporter();
  let commandBus: CommandBus;
  let queryBus: QueryBus;

  beforeAll(async () => {
    trace.setGlobalTracerProvider(
      new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }),
    );
    const moduleRef = await Test.createTestingModule({
      imports: [CqrsModule.forRoot()],
      providers: [BookHandler, FindHandler, HandlerTracing],
    }).compile();
    await moduleRef.init();
    commandBus = moduleRef.get(CommandBus);
    queryBus = moduleRef.get(QueryBus);
  });

  afterEach(() => exporter.reset());
  afterAll(() => trace.disable());

  const onlySpan = () => {
    const spans = exporter.getFinishedSpans();
    const [span, ...others] = spans;
    if (span === undefined || others.length > 0) {
      throw new Error(`expected exactly one span, got ${spans.length}`);
    }
    return span;
  };

  it('records a successful command with its name and outcome', async () => {
    await expect(commandBus.execute(new BookCommand())).resolves.toEqual({ id: 'a-1' });

    const span = onlySpan();
    expect(span.name).toBe('command Book');
    expect(span.attributes).toMatchObject({
      'cqrs.kind': 'command',
      'cqrs.name': 'Book',
      outcome: 'success',
    });
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('records a query', async () => {
    await expect(queryBus.execute(new FindQuery())).resolves.toEqual(['x']);

    expect(onlySpan()).toMatchObject({
      name: 'query Find',
      attributes: { 'cqrs.kind': 'query', outcome: 'success' },
    });
  });

  it('records a business rejection as an outcome with the error code, not a span error', async () => {
    await expect(commandBus.execute(new BookCommand('conflict'))).rejects.toBeInstanceOf(
      SlotTakenError,
    );

    const span = onlySpan();
    expect(span.attributes).toMatchObject({ outcome: 'conflict', 'error.code': 'SLOT_TAKEN' });
    expect(span.status.code).toBe(SpanStatusCode.UNSET);
    expect(JSON.stringify(span.attributes)).not.toContain('customer@example.com');
  });

  it('marks an unexpected error as a span error and rethrows it', async () => {
    await expect(commandBus.execute(new BookCommand('crash'))).rejects.toThrow('db down');

    const span = onlySpan();
    expect(span.attributes).toMatchObject({ outcome: 'error' });
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.map((e) => e.name)).toContain('exception');
  });
});

describe('outcomeOf', () => {
  it.each([
    [new SlotTakenError(), 'conflict'],
    [new Missing(), 'not_found'],
    [new Malformed(), 'invalid'],
    [new Refused(), 'rejected'],
    [new Error('boom'), 'error'],
    ['not an error', 'error'],
  ])('maps %p to %s', (error, outcome) => {
    expect(outcomeOf(error)).toBe(outcome);
  });
});
