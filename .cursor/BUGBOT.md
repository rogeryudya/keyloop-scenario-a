# Bugbot rules

Review against the project rules in CLAUDE.md, docs/architecture/README.md and docs/conventions.md.
Requirements and assumptions: docs/requirements.md. Flag especially:

- layer violations (domain importing Nest/Prisma, controllers not using CommandBus/QueryBus)
- business rules in controllers or DTOs instead of domain
- entities, views or Prisma types leaking across layers (docs/architecture/data-types.md)
- missing tests for new business rules or failure branches
- non-standard error responses, missing cursor pagination on list endpoints
- secrets, `any`, `new Date()` in domain/application
- secret values (DB password, connection URL) in logs or error messages; `process.env` read outside `src/config`
- unpinned images or actions, `:latest` tags, Terraform resources without the project/env tags

Bugbot is advisory: a human reviews and resolves its comments.
