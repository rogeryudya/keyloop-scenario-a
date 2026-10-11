# M4 — AWS-like environment and full CI

**Status:** `todo`
**Goal:** the service runs the way it would on AWS (RDS + Secrets Manager via floci, provisioned with Terraform), reviewers can start everything with one command, and CI guards it all.
**Requirements:** NFR-1

## Tasks
- [ ] Replace the temporary `postgres` Compose service with floci (RDS + Secrets Manager); pin all image versions (see `docs/local-dev/docker-compose.md`)
- [ ] Terraform `infra/modules/database` + `envs/local` (floci): RDS + RDS-format secrets; `pnpm infra:up|plan|down` via the Terraform container (see `docs/infrastructure.md`)
- [ ] `infra/envs/aws-dev` skeleton using the same module; passes `terraform validate`
- [ ] `DbCredentialsProvider`: Secrets Manager mode (`DB_SECRET_ID`); `db:migrate`/`db:seed` via `with-db-url`
- [ ] Integration test: credential loading from floci Secrets Manager (incl. missing / malformed secret)
- [ ] Multi-stage Dockerfile (`tools`, `runtime`) + Compose `app` profile: bootstrap → migrate/seed → api
- [ ] CI: add `terraform` and `smoke` jobs per `docs/ci.md`; Dependabot config
- [ ] Branch protection on `main` with required checks; Bugbot installed with `.cursor/BUGBOT.md`
- [ ] Update README quickstart and `CLAUDE.md` commands

## Acceptance criteria
- Dev mode: `docker compose up -d && pnpm infra:up && pnpm db:migrate && pnpm start:dev` → `/health` 200 with credentials from floci Secrets Manager
- `docker compose --profile app up --build` from a clean state → `/health` 200 and booking an appointment via Swagger works
- A PR shows all CI checks green and a Bugbot review

## Notes
- Risk: floci RDS through Terraform and the Docker socket on Windows are unverified. Spike these first; the fallback is in `docs/local-dev/aws-emulation.md`.
