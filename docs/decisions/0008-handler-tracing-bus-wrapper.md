# 0008 — Handler spans by wrapping the CQRS buses

- **Status:** accepted
- **Date:** 2026-10-13

## Context
NFR-5 asks for a span per command/query handler with its outcome (M5). `@nestjs/cqrs` has no pipeline
behaviours, and handlers live in `application/`, which must not import OpenTelemetry. Its
`commandPublisher` / `queryPublisher` options only feed the observable stream, not the handler call.

## Decision
`HandlerTracing` (`src/shared/infrastructure/tracing/`) replaces `CommandBus.execute` and
`QueryBus.execute` once, in `onModuleInit`, with a wrapper that runs the original inside an active span
`command <Name>` / `query <Name>`. Attributes: `cqrs.kind`, `cqrs.name`, `outcome`
(`success | invalid | not_found | conflict | rejected | error`) and, for a `DomainError`, `error.code`.
Only unexpected errors set the span status to ERROR; business rejections are expected outcomes.

## Alternatives considered
- A decorator on each handler class: the decorator would live in infrastructure, and application may not import it (layer rules).
- A Nest interceptor: it wraps the controller, not the handler, so it can't name the use case or see handler-only calls.
- Subclassing `CommandBus` and overriding the provider: it fights `CqrsModule.forRoot()`'s own registration for no gain.
- `@opentelemetry/instrumentation-nestjs-core`: it doesn't patch the ESM-only Nest 12, and it has no business outcome.

## Consequences
- Handlers stay free of tracing code; a new handler is traced automatically.
- It relies on the buses being singletons shared with controllers (true with `CqrsModule.forRoot()`).
- Span attributes carry only the error code, never messages or details, so no request data or PII leaks.
- With telemetry off, `@opentelemetry/api` returns a no-op tracer, so the wrapper adds no export cost.
