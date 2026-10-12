# M4 — AWS-like environment and full CI

**Status:** `in-progress`
**Goal:** the service runs the way it would on AWS (RDS + Secrets Manager via floci, provisioned with Terraform), reviewers can start everything with one command, and CI guards it all.
**Requirements:** NFR-1

## Tasks
- [x] Replace the temporary `postgres` Compose service with floci (RDS + Secrets Manager); pin all image versions (see `docs/local-dev/docker-compose.md`)
- [x] Terraform `infra/modules/database` + `envs/local` (floci): RDS + RDS-format secrets; `pnpm infra:up|plan|down` via the Terraform container (see `docs/infrastructure.md`)
- [x] `infra/envs/aws-dev` skeleton using the same module; passes `terraform validate`
- [x] `DbCredentialsProvider`: Secrets Manager mode (`DB_SECRET_ID`); `db:migrate`/`db:seed` via `with-db-url`
- [x] Integration test: credential loading from floci Secrets Manager (incl. missing / malformed secret)
- [x] Multi-stage Dockerfile (`tools`, `runtime`) + Compose `app` profile: bootstrap → migrate/seed → api
- [x] CI: add `terraform` and `smoke` jobs per `docs/ci.md`; Dependabot config
- [ ] Branch protection on `main` with required checks; Bugbot installed with `.cursor/BUGBOT.md`
- [x] Update README quickstart and `CLAUDE.md` commands

## Acceptance criteria
- Dev mode: `docker compose up -d && pnpm infra:up && pnpm db:migrate && pnpm start:dev` → `/health` 200 with credentials from floci Secrets Manager
- `docker compose --profile app up --build` from a clean state → `/health` 200 and booking an appointment via Swagger works
- A PR shows all CI checks green and a Bugbot review

## Notes
- Risk: floci RDS through Terraform and the Docker socket on Windows are unverified. Spike these first; the fallback is in `docs/local-dev/aws-emulation.md`.
- Spike (task 1): the Docker socket on Windows works. RDS through the **AWS API** (CLI) works: the instance is available in seconds, Postgres 17 runs via the image override, and the host (`localhost:7001`) and the Compose network (`floci:7001`) both reach it. State survives restarts, and `down -v` cleans up. Details in `docs/local-dev/aws-emulation.md`. RDS through **Terraform** works too (task 2): apply, a no-op re-apply, destroy, and re-create all succeed, and both secrets log in to Postgres 17.11.
- Task 4: dev-mode acceptance verified (`infra:up` → `db:migrate` → `db:seed` → API → `/health` 200 with `db: up`, credentials from floci Secrets Manager). Existing local `.env` files must be updated from `.env.example`: `DB_SECRET_ID`, `AWS_REGION`, `AWS_ENDPOINT_URL` and the dummy AWS keys replace the old `DATABASE_URL`.
- Task 6: full-stack acceptance verified from a clean state (`down -v` → `--profile app up --build`). floci healthy → bootstrap exits 0 → migrate exits 0 → api healthy; `/health` 200, Swagger 200, `POST /v1/appointments` 201 `CONFIRMED`. A second `up` re-runs both one-shot jobs cleanly. Verified on Podman 5.8.5 (Windows) with `DOCKER_BUILDKIT=0`; the BuildKit path runs in CI (task 7).
- Task 7: `terraform` and `smoke` jobs plus Dependabot (docker, docker-compose, terraform) checked locally (actionlint, tflint, `compose up --wait` with the one-shot jobs). They haven't run on GitHub yet; the first PR from this branch will exercise them.
- Task 8 (open): `.cursor/BUGBOT.md` is in the repo. Still pending, and needs the repo owner: (1) branch protection, which GitHub refuses for this private repo on the free plan (`403 Upgrade to GitHub Pro or make this repository public`), so make it public or upgrade first; the required checks also need one CI run on GitHub before they can be selected. (2) Installing the Cursor Bugbot GitHub App, which needs a Cursor account.
- Follow-up: the runtime image is about 560 MB because `prisma` comes in as a resolved peer of `@prisma/client`. OTel env vars for `api` come with tracing in M5.
- New dependency: `@aws-sdk/client-secrets-manager` (official SDK to read the DB secret; honours a custom endpoint for floci).
- The old `keyloop_postgres-data` volume from M0–M3 is orphaned; remove it with `docker volume rm keyloop_postgres-data` when you no longer need it.
