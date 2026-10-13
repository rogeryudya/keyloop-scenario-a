import { Module } from '@nestjs/common';
import { HandlerTracing } from './handler-tracing';

/** Spans for every command/query handler run. Needs `CqrsModule.forRoot()` (global buses). */
@Module({ providers: [HandlerTracing] })
export class TracingModule {}
