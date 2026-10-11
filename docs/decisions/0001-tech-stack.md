# 0001 — Tech stack

- **Status:** accepted
- **Date:** 2026-10-12

## Context
Interview assignment: a backend service that reviewers must be able to run and read quickly, built with heavy AI assistance,
so structure and conventions need to be explicit and predictable.

## Decision
Node 24 LTS, TypeScript strict, NestJS, PostgreSQL with Prisma, Jest + Supertest, ESLint + Prettier, pnpm, Docker Compose.

## Alternatives considered
- Express/Fastify alone — less boilerplate, but no enforced module/DI structure; AI output drifts more.
- TypeORM — decorators fit Nest, but Prisma gives a single readable schema file and typed queries.
- SQLite — simpler setup, but weaker concurrency/constraint story for business rules; Postgres via Docker is still one command.

## Consequences
- Clear layering (module/controller/service) that the AI can follow consistently.
- Reviewers need Docker for the DB.
- Prisma migrations are the only way to change the schema.
