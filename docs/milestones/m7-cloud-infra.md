# M7 — Cloud-ready infrastructure (stretch)

**Status:** `in-progress`
**Goal:** show the API running the way it would in AWS (container image in ECR, ECS Fargate service), provisioned by Terraform against floci.
**Requirements:** none from the brief; demonstrates production readiness. Only start once M0–M6 are done.

## Tasks
- [x] `infra/modules/ecr`: repository + lifecycle policy
- [x] `infra/modules/network`: VPC, subnets, security groups
- [x] `infra/modules/ecs-service`: cluster, task definition (`DB_SECRET_ID`, OTel env), service, ALB, IAM task/execution roles (secret read only), log group
- [x] `pnpm infra:ecs`: build `runtime` image → push to floci ECR → apply → wait for healthy
- [x] `envs/aws-dev` wires all modules; passes `terraform validate` (never applied)
- [ ] Design notes: what floci proves vs what it can't (IAM enforcement, real networking, scaling)

## Acceptance criteria
- `pnpm infra:ecs` from a clean state → `GET /health` through the ECS service returns 200
- CI `terraform` job green for both envs

## Notes
- **Spike (2026-10-13, floci 2.2.0, Terraform 1.16.5, AWS provider ~> 6.68, Podman 5.8.5 on Windows):** the whole
  M7 path works on floci. Terraform created VPC, 2 subnets, 2 SGs, ECR repo + lifecycle policy, IAM roles + policies,
  log group, ECS cluster, task definition, Fargate service, ALB, target group and listener (18 resources) in 79 s.
  The ALB's waiter accounts for 60 s of that. Through the ALB, `GET /health` returned `{"status":"ok","db":"up"}`.
  A re-plan showed no changes, and destroy took 22 s.
- **ECR:** a real registry. floci runs `registry:2` behind the repo URI
  `000000000000.dkr.ecr.us-east-1.localhost:4566/<repo>`. The registry is plain HTTP and accepted pushes without login.
  - Docker CLI on Podman refuses it: `server gave HTTP response to HTTPS client`. `podman push --tls-verify=false`
    works (13 s for the API image).
  - `docker login` from Windows fails, because the Windows resolver doesn't resolve the `*.localhost` name. The push
    itself runs inside the Podman machine, where it does resolve.
  - Docker Engine (CI, Docker Desktop) is **not yet verified**. It may need the registry treated as insecure.
- **ECS:** Fargate `awsvpc` tasks run as real containers named `floci-aws-ecs-<task>-<container>` on the Compose
  network (`keyloop_default`).
  - The task read its DB secret from floci Secrets Manager (`AWS_ENDPOINT_URL=http://floci:4566`) and connected to RDS.
  - The container health check runs, and ECS reports `HEALTHY`.
  - `awslogs` ships stdout to CloudWatch Logs.
  - `describe-tasks` reports an emulated VPC IP (e.g. `172.31.0.10`). The container's real address is a Docker
    network IP (e.g. `10.89.1.40`).
- **EC2:** default VPC/subnets/SG exist, and unknown subnet ids are rejected. A custom VPC, subnets and SGs work
  through Terraform. Whether SG rules are enforced was **not tested** (tasks are reachable by Docker IP).
- **ALB:** floci has a real data plane. Each listener port is opened inside the floci container and forwards to targets.
  - Port 80 fails (`Permission denied`, floci runs as non-root), so use 8080+ locally and 80 in `aws-dev`.
  - An ECS service with `load_balancer` registers the container's real IP in the target group automatically.
  - Target health stays `unhealthy` even while the target serves 200; traffic is forwarded anyway. A floci quirk,
    so don't gate the script on target health. Poll `GET /health` through the listener instead.
  - Traffic flows about 10–15 s after the service is created (503 until then).
  - To reach it from the host, the listener port must be published on the `floci` service in Compose.
- **IAM:** roles, attachments and inline policies are created and readable, but not enforced. The local task used the
  dummy access keys from its environment.
- **Implications for the tasks:**
  - Listener port as a variable (8080 local, 80 aws-dev), published on `floci`.
  - The ECS module takes extra env vars, so local adds `AWS_ENDPOINT_URL` and the dummy keys, while aws-dev relies on
    the task role.
  - `pnpm infra:ecs` needs an engine-aware push (Podman: `--tls-verify=false`) and should wait on `/health` through
    the ALB, not on target health.
  - Verify the push on Docker Engine before relying on it in CI.
- Task 1: `infra/modules/ecr` was applied to floci from a throwaway root: the repo and lifecycle policy were created, and mutability, scan-on-push and both lifecycle rules read back as configured. A re-plan was clean and destroy worked. Invalid `image_tag_mutability` and `max_image_count` values are rejected with clear messages. `terraform fmt` and tflint are clean. No env uses the module yet: `envs/local` gets it with `pnpm infra:ecs` (task 4) and `envs/aws-dev` in task 5, so CI's `validate` covers it from then.
- Task 2: `infra/modules/network` was applied to floci with the NAT gateway on: all 26 resources (VPC, IGW, 4 subnets, route tables, EIP + NAT, 3 SGs with 6 rules, DB subnet group) in 19 s. Destroy worked, and fmt and tflint are clean.
  - **Gotcha for task 4:** with `skip_requesting_account_id = true` (set in `envs/local` today), the four rules that reference another security group show a diff on every plan. floci returns the reference as `000000000000/sg-…`, and the provider only strips the prefix when it knows its own account id. Without the flag (floci STS answers `GetCallerIdentity`), the re-plan is clean.
  - Removing the flag on an **existing** state fails with `Unexpected Identity Change`. Task 4 must handle that for existing `tf-state` volumes: recreate, or move the ECS stack to its own root/state.
- Task 3: `infra/modules/ecs-service` was tested on floci together with `network` and `ecr` (ECR applied first, image pushed, then the rest):
  - 34 resources in 79 s; `/health` through the ALB returned `db: up` about 25 s later; the re-plan was clean.
  - The task had exactly the intended environment. `DB_SECRET_ID` is the secret **ARN**, and floci resolved it.
  - Logs reached CloudWatch, and traces reached Tempo under the service name.
  - Redeploying a new image tag created task definition revision 2 and rolled the service (`COMPLETED`). floci stops the old task first, so there was about 10 s of 503; AWS keeps the old task until the new one is healthy.
  - Destroy removed all 36 resources (34 + the 2 ECR ones). fmt and tflint are clean.
- Task 4: `pnpm infra:ecs` / `infra:ecs:down` (`scripts/infra/ecs.ts`, root `infra/envs/local-ecs` with its own state).
  - **Acceptance met from a clean state:** after `infra:ecs:down` (36 resources destroyed in 12 s) and
    `docker compose --profile app --profile tools down -v`, one run took 330 s on Podman/Windows (data layer, ECR, build,
    push, 34 resources, healthy). Through the ALB, `/health` returned `db: up`, a booking returned 201, and `/docs`
    returned 200. A re-plan against the deployed stack shows no changes.
  - **Redeploy:** a second run rolled the service to task definition revision 2 (`COMPLETED`).
  - **Gotcha found on the first run:** floci starts tasks through the host engine. Without a local image under the ECR
    name, Podman tried to pull over HTTPS from floci's plain-HTTP registry, and the task failed to start (`FAILED`
    rollout, ALB `No targets available`). The build is now tagged with the ECR name too. The spike hadn't shown this,
    because `podman push` had left that tag behind.
  - **Push:** crane (`docker save`, then `crane push --insecure` from a container on the Compose network, with
    `--add-host` mapping the ECR hostname to floci). It works the same on every engine, so the untested Docker Engine
    push from the spike is no longer needed. Pushing via `localhost:4566/<repo>` doesn't work: floci routes the
    registry by hostname (404).
  - `.terraform.lock.hcl` for `local-ecs` carries hashes for all five platforms (verified with `providers lock`).
  - In Git Bash, `docker compose run -w /infra/...` needs `MSYS_NO_PATHCONV=1`, or the path is rewritten into a
    Windows path.
- Task 5: `envs/aws-dev` now wires `network` (NAT on, AZs from the region), `database` (private subnet group + DB
  security group from `network`, replacing two input variables), `ecr` (IMMUTABLE) and `ecs-service` (2 tasks, port 80,
  `wait_for_steady_state`, no floci endpoint or keys, optional OTel endpoint). Only `image_tag` is required.
  - `terraform validate` passes for all three envs; fmt and tflint are clean.
  - Beyond validate: a full `plan` against floci, from a scratch copy with a local backend override, gave 43 resources
    and no errors. That shows the module wiring and the values passed between modules resolve.
  - The lock file is unchanged (same providers).
