# Architecture

Clean Architecture + CQRS via a mediator (`@nestjs/cqrs`), organised as a modular monolith.
Rationale: [../decisions/0002-clean-architecture-cqrs.md](../decisions/0002-clean-architecture-cqrs.md).

> Examples use the real `appointments` module. Names follow the glossary in `../requirements.md`.

## Read when…
| Task | Read |
|---|---|
| Deciding where a file goes / creating a module | [folder-structure.md](folder-structure.md) |
| Understanding how a request travels | [request-flow.md](request-flow.md) |
| DTO vs Command vs View vs Entity vs Prisma model | [data-types.md](data-types.md) |
| Entities, value objects, business rules, domain errors | [domain.md](domain.md) |
| Commands, queries, handlers, transactions, cross-cutting | [application.md](application.md) |
| Repositories, Prisma, mappers, config | [infrastructure.md](infrastructure.md) |
| Controllers, DTOs, versioning, error → HTTP | [presentation.md](presentation.md) |
| Writing tests | [../testing/README.md](../testing/README.md) |

Everything below this line applies to **every** task.

## Layers and the dependency rule

```
┌──────────────────────────────────────────────────────────┐
│ presentation   controllers, request/response DTOs        │
│  │  sends Command/Query through the mediator only        │
│  ▼                                                       │
│ application    commands, queries, handlers, ports        │
│  │  orchestrates use cases, owns transactions            │
│  ▼                                                       │
│ domain         entities, value objects, domain services, │
│                domain errors, repository interfaces      │
└──────────────────────────────────────────────────────────┘
  infrastructure  Prisma repositories, mappers, external
                  adapters; implements the ports (points inward)
```

**Dependencies point inward only.**

| Layer | May import | Must NOT import |
|---|---|---|
| `domain` | other `domain` code, `shared/domain` | `@nestjs/*`, `@prisma/client`, `class-validator`, application, infrastructure, presentation |
| `application` | `domain`, `shared`, `@nestjs/cqrs`, `@nestjs/common` (only `Injectable`/`Inject`) | `@prisma/client`, infrastructure, presentation, HTTP exceptions |
| `infrastructure` | `domain`, `application` (ports), `@prisma/client`, Nest | presentation |
| `presentation` | `application` (commands, queries, result types), `shared`, Nest, `class-validator`, Swagger | `domain` entities directly, infrastructure, repositories, Prisma |

These rules are enforced by lint (ESLint `boundaries` plugin or `dependency-cruiser`, set up in M0). A boundary violation is a bug.

**The key decoupling:** a controller knows only `CommandBus`/`QueryBus` and message classes. It never knows which handler runs, which repository is used, or that Prisma exists.

## Types crossing layers
```
Prisma row ──mapper──▶ Entity ──handler──▶ XView ──controller──▶ XResponseDto
 (infrastructure)      (domain)        (application)          (presentation)
```
No type skips a step: controllers never see entities, handlers never see Prisma rows. Full definitions and examples: [data-types.md](data-types.md).

## Pragmatism rules (avoid over-engineering)
- No generic base repository and no abstraction "for later". Add a port only when there's a real adapter.
- Simple reads may skip the domain layer (query handler → read port → view). Writes always go through domain.
- One aggregate per command where possible; cross-aggregate rules go in a domain service called by the handler.
- If a pattern here doesn't fit a case, write an ADR rather than silently diverging.
