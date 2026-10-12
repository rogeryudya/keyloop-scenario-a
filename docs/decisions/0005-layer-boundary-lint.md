# 0005 — Layer boundary lint

- **Status:** accepted
- **Date:** 2026-10-12

## Context
The dependency rules in `docs/architecture/README.md` must fail `pnpm lint`, not rely on review. Two kinds of rule exist:
imports between our own folders (layer → layer, module → module) and third-party packages per layer (`@prisma/client`,
`@nestjs/*`, `class-validator`, and only `Injectable`/`Inject` from `@nestjs/common` in application).

## Decision
Use two tools in one ESLint run, both configured in `eslint.boundaries.mjs`:
- `eslint-plugin-boundaries` v7 for local imports. Elements are classified by path, with the module name captured so
  "same module only" rules can use `{{ from.element.captured.module }}`. The default is `disallow`, so a new folder is
  blocked until a policy allows it.
- ESLint core `no-restricted-imports`, scoped per layer by file glob, for packages. `allowImportNames` limits
  `@nestjs/common` in application to `Injectable` and `Inject`.

## Alternatives considered
- dependency-cruiser: a separate tool and config format outside ESLint, so editors don't show violations inline.
- boundaries alone for packages too: its v7 docs don't confirm wildcard sources or named-import selectors.
  `no-restricted-imports` is well documented and simple.

## Consequences
- A new top-level folder under `src/` (beyond `modules/`, `shared/`, `config/`, `health/`) needs an element and policy, or its imports fail lint.
- Test files (`*.spec.ts`, `*.e2e-spec.ts`, `test/**`) may import anything. Production code may not import `test/`.
- If the folder layout changes, update `eslint.boundaries.mjs` in the same change.
