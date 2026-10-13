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
