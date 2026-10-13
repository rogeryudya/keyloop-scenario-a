# ecs-service module

Runs the API on ECS Fargate behind an Application Load Balancer:

- **Cluster, task definition and service.** Tasks run in the private subnets and register in the ALB target
  group by IP. The deployment circuit breaker rolls back a deployment whose tasks never become healthy.
- **Container:** the image with `NODE_ENV=production`, `PORT`, `AWS_REGION` and `DB_SECRET_ID` (the secret's
  ARN), plus the OTel settings when an endpoint is given and any extra `environment`. The container health check
  matches the Dockerfile `HEALTHCHECK`; logs go to a CloudWatch log group.
- **IAM, least privilege:**
  - the **execution role** has AWS's managed `AmazonECSTaskExecutionRolePolicy` (pull from ECR, write logs);
  - the **task role**, which the app runs as, may only `secretsmanager:GetSecretValue` on the DB secret.
- **ALB:** HTTP listener on `listener_port`, IP target group with `/health` checks. HTTPS needs a certificate
  (ACM) and a domain, which are out of scope.

| Input | Default | Notes |
|---|---|---|
| `name` | — | Cluster, service, task family, ALB, target group and log group name |
| `image` | — | `<repository_url>:<unique tag>` (deploy by git sha) |
| `cpu` / `memory` | `256` / `512` | Fargate task size |
| `desired_count` | `1` | |
| `container_port` | `3000` | |
| `listener_port` | `80` | floci can't open ports below 1024; local uses 8080 |
| `health_check_path` | `/health` | ALB and container health check |
| `vpc_id`, `public_subnet_ids`, `private_subnet_ids`, `alb_security_group_id`, `task_security_group_id` | — | From the `network` module |
| `assign_public_ip` | `false` | Tasks stay private |
| `db_secret_arn` | — | Passed as `DB_SECRET_ID`; the only secret the task role can read |
| `otel_exporter_otlp_endpoint` | `null` | OTLP/HTTP collector; also sets `OTEL_SERVICE_NAME` to `name` |
| `environment` | `{}` | Extra variables, e.g. `AWS_ENDPOINT_URL` for floci. Never secrets |
| `log_retention_days` | `14` | |
| `wait_for_steady_state` | `false` | Make `apply` wait for healthy tasks |

Outputs: `alb_dns_name`, `alb_url`, `cluster_name`, `service_name`, `task_definition_arn`, `log_group_name`,
`task_role_arn`, `execution_role_arn`.

**On floci** (see `docs/milestones/m7-cloud-infra.md` › Notes):
- tasks run as real containers on the Compose network;
- the ALB forwards real traffic on its listener port inside the floci container;
- IAM is created but not enforced, so the local env passes floci's endpoint and dummy keys through `environment`;
- a new image tag rolls the service to a new task definition revision, but floci stops the old task first, so
  expect about 10 s of 503 during a local redeploy.
