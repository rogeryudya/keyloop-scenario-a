# M7 — Cloud-ready infrastructure (stretch)

**Status:** `todo`
**Goal:** show the API running the way it would in AWS (container image in ECR, ECS Fargate service), provisioned by Terraform against floci.
**Requirements:** none from the brief; demonstrates production readiness. Only start once M0–M6 are done.

## Tasks
- [ ] `infra/modules/ecr`: repository + lifecycle policy
- [ ] `infra/modules/network`: VPC, subnets, security groups
- [ ] `infra/modules/ecs-service`: cluster, task definition (`DB_SECRET_ID`, OTel env), service, ALB, IAM task/execution roles (secret read only), log group
- [ ] `pnpm infra:ecs`: build `runtime` image → push to floci ECR → apply → wait for healthy
- [ ] `envs/aws-dev` wires all modules; passes `terraform validate` (never applied)
- [ ] Design notes: what floci proves vs what it can't (IAM enforcement, real networking, scaling)

## Acceptance criteria
- `pnpm infra:ecs` from a clean state → `GET /health` through the ECS service returns 200
- CI `terraform` job green for both envs

## Notes
-
