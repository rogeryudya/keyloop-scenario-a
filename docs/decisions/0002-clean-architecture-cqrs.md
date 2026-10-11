# 0002 — Clean Architecture with CQRS mediator

- **Status:** accepted
- **Date:** 2026-10-12

## Context
The assignment is judged largely on business logic quality and design. We want the core business rules
independent of HTTP and Prisma, so they're easy to test and reason about. Presentation should depend on
use cases, not on concrete services. AI-generated code also needs a rigid, predictable place for every kind of code.

## Decision
- Clean Architecture layers per module: `domain`, `application`, `infrastructure`, `presentation`, with inward-only dependencies enforced by lint.
- Controllers talk to the core only through a mediator: `@nestjs/cqrs` `CommandBus` / `QueryBus`, with one handler per use case.
- Repository ports are abstract classes in domain; Prisma adapters live in infrastructure.
- Transactions via `@nestjs-cls/transactional` (Prisma adapter), owned by command handlers.

## Alternatives considered
- Layered Nest (controller → service → Prisma): less code, but business logic couples to Prisma/Nest and services grow large.
- Custom mediator (MediatR-style with pipeline behaviors): more control, but more code to own and less familiar to reviewers/AI. `@nestjs/cqrs` is official and typed (v11+).
- Full DDD with event sourcing: overkill for the assignment's scope.

## Consequences
- More files per feature (command, handler, DTOs, mapper). Accepted for clarity; one folder per use case keeps it navigable.
- No pipeline behaviors: cross-cutting concerns go to interceptors, the exception filter and `@Transactional()` (see architecture/application.md).
- Domain is pure TS and unit-testable without Nest.
- Boundary lint must be in place from M0, or the layers will erode.
