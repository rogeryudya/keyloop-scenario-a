# 0004 — Terraform for infrastructure; ECS/ECR as a stretch goal

- **Status:** accepted
- **Date:** 2026-10-12

## Context
In a real deployment, infrastructure would be managed with Terraform and the API would run as a container on AWS. floci emulates RDS, Secrets Manager, ECR (real registry) and ECS (real containers) and works with the standard Terraform AWS provider. The interview, however, mainly evaluates the backend design and business logic, so infrastructure must not crowd that out.

## Decision
- Terraform defines all AWS resources, in reusable modules with per-environment roots (`envs/local` for floci, `envs/aws-dev` for the real-AWS shape).
- **M0:** only the data layer (RDS + DB secrets) via Terraform, replacing the TypeScript bootstrap script.
- **M6 (stretch):** ECR + ECS Fargate service (+ network, IAM, ALB) applied to floci; real AWS is `validate`/`plan` only.
- Docker Compose stays the primary run path for reviewers; Terraform runs inside a container so no local install is needed.

Update: after the brief arrived, milestones were renumbered. The data layer is now in M4 and ECS/ECR in M7, so business logic (M1–M3) comes first.

## Alternatives considered
- Bootstrap script with AWS SDK: simpler, but throwaway and unlike real practice.
- ECS from day one: high setup cost before any business value; risk of spending interview time on infra debugging.
- AWS CDK / Pulumi: also valid; Terraform matches the team's real-world tooling.

## Consequences
- Same modules local and real, so the local env doubles as a test of the IaC.
- floci emulation gaps (e.g. RDS proxy ports, no real IAM enforcement) must be noted in design notes.
- Terraform state for local lives in a volume/git-ignored file; resetting means `infra:down` or `docker compose down -v`.
