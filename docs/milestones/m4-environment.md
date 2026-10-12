# M4 — AWS-like environment and full CI

**Status:** `in-progress`
**Goal:** the service runs the way it would on AWS (RDS + Secrets Manager via floci, provisioned with Terraform), reviewers can start everything with one command, and CI guards it all.
**Requirements:** NFR-1

## Tasks
- [x] Replace the temporary `postgres` Compose service with floci (RDS + Secrets Manager); pin all image versions (see `docs/local-dev/docker-compose.md`)
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
- Spike (task 1): the Docker socket on Windows works. RDS through the **AWS API** (CLI) works: the instance is available in seconds, Postgres 17 runs via the image override, and the host (`localhost:7001`) and the Compose network (`floci:7001`) both reach it. State survives restarts, and `down -v` cleans up. Details in `docs/local-dev/aws-emulation.md`. RDS through **Terraform** is still unverified (task 2).
- Transitional gap: with the Compose `postgres` gone, `pnpm start:dev` has no local DB until `pnpm infra:up` (task 2) and `DB_SECRET_ID` support (task 4) land. Tests are unaffected (Testcontainers). Stopgap: create an instance with the AWS CLI and set `DATABASE_URL` to its proxy port.
- The old `keyloop_postgres-data` volume from M0–M3 is orphaned; remove it with `docker volume rm keyloop_postgres-data` when you no longer need it.
