# Infrastructure as Code (Terraform)

All AWS resources are defined in Terraform. The **same modules** target floci (local, free, no AWS account) or real AWS; only the environment folder and provider settings differ.
Rationale: [decisions/0004-terraform-ecs.md](decisions/0004-terraform-ecs.md).

## Scope by phase
| Phase | Resources | Applied to |
|---|---|---|
| **M4: data layer** | RDS Postgres, Secrets Manager DB secret(s) | floci (replaces the bootstrap script) |
| **M7: compute (stretch)** | ECR repo, ECS cluster + Fargate service + task definition, IAM roles, CloudWatch log group, VPC/subnets/SGs, ALB | floci (real containers); real AWS = `plan` only |
| Not in scope | Real AWS `apply`, DNS/TLS, autoscaling policies, WAF | — |

## Layout
```
infra/
  modules/
    database/          aws_db_instance, random_password, DB secret(s) in RDS secret format
    ecr/               (M7) repository + lifecycle policy
    network/           (M7) VPC, subnets, security groups
    ecs-service/       (M7) cluster, task def, service, ALB target group, IAM task/execution roles, log group
  envs/
    local/             floci: provider with skip flags, local state, applies database (+ M7 modules)
    aws-dev/           real AWS shape: S3 backend, same modules; CI runs validate only, never apply
  .tflint.hcl
```

## Provider for floci (`envs/local`)
```hcl
provider "aws" {
  region     = "us-east-1"
  access_key = "test"
  secret_key = "test"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true
}
```
No `endpoints {}` block: the endpoint comes from `AWS_ENDPOINT_URL` (`http://localhost:4566` from the host, `http://floci:4566` inside Compose), so the same config works in both places.

**State:** local backend with `path = "state/terraform.tfstate"` in `envs/local`. The `state/` folder is git-ignored and mounted as the `tf-state` Docker volume when run via Compose, so state survives container runs. `aws-dev` declares an S3 backend with S3-native locking (`use_lockfile`; DynamoDB lock tables are deprecated) but is never initialised against real AWS in this project.

## `envs/aws-dev` (real-AWS shape)
The same modules as the floci envs, wired for real AWS, with no floci flags and credentials from the standard AWS chain:

- **`network`:** the first two AZs of the region, public and private subnets, and a NAT gateway (private tasks need a
  route to ECR, Secrets Manager and Logs).
- **`database`:** RDS in the network module's private subnet group and DB security group. `secret_hosts` stays empty,
  so the app's secret is `keyloop-dev/db` holding the real instance address.
- **`ecr`:** `IMMUTABLE` tags.
- **`ecs-service`:** 2 tasks in private subnets behind an ALB on port 80, `wait_for_steady_state`. The task role reads
  the DB secret, so there are no keys and no endpoint override in the task. OTel is off unless
  `otel_exporter_otlp_endpoint` is set (e.g. a Datadog Agent or ADOT collector).

The only required input is `image_tag`, set by a deploy pipeline (`terraform.tfvars.example`). Outputs: `api_url`,
`repository_url`, cluster/service, log group, DB endpoint and secret ARN. It is never applied in this project. Besides
CI's `validate`, a full `plan` was run against floci (43 resources), with a local backend in a scratch copy.
Validate without AWS access:
`docker compose run --rm --no-deps -e TF_DATA_DIR=/tmp/tf -w /infra/envs/aws-dev --entrypoint sh terraform -c 'terraform init -backend=false && terraform validate'`
(a separate `TF_DATA_DIR`, so it doesn't share the `tf-data` volume with `envs/local`).

## `database` module contract
Inputs: `name`, `engine_version` (default `17`), `instance_class`, `allocated_storage`, `db_name`, `username`, `secret_hosts` (map of secret-suffix → host override; local only), `skip_final_snapshot`.
Outputs: `endpoint`, `port`, `secret_arns`. Full table: `infra/modules/database/README.md`.

With `secret_hosts` empty (real AWS), the module writes a single secret `<name>/db` holding the instance address.
Secrets use `recovery_window_in_days = 0`, so `infra:down` followed by `infra:up` can reuse the names.

The secret is created by Terraform (not RDS-managed) so it holds the full RDS-format JSON the app expects (`engine, host, port, username, password, dbname`):
```hcl
resource "aws_secretsmanager_secret_version" "db" {
  for_each      = local.secret_hosts            # local: { local = "localhost", docker = "floci" }; aws: { default = address }
  secret_id     = aws_secretsmanager_secret.db[each.key].id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = each.value
    port     = aws_db_instance.this.port         # floci assigns a proxy port (7001-7099)
    username = aws_db_instance.this.username
    password = random_password.db.result
    dbname   = var.db_name
  })
}
```
Secret ids: `keyloop/local/db`, `keyloop/docker/db` (see `local-dev/docker-compose.md`).

## `ecr` module contract (M7)
One private repository for the API image: `aws_ecr_repository` with scan on push, and a lifecycle policy in which untagged images expire after `untagged_expiry_days` (default 1) and only the newest `max_image_count` (default 10) are kept.
Tags are `IMMUTABLE` by default, so deploys use a unique tag (the git sha) and a tag always means the same image. `force_delete` is for throwaway environments.
Outputs: `repository_url`, `repository_arn`, `repository_name`, `registry_id`. Full table: `infra/modules/ecr/README.md`.

## `network` module contract (M7)
A VPC with public subnets (ALB, NAT gateway) and private subnets (ECS tasks, RDS), one of each per AZ.
Security groups chain hop by hop: internet → ALB (listener port) → tasks (app port, from the ALB only) → RDS (Postgres, from the tasks only).
It also creates an RDS subnet group for the `database` module. `enable_nat_gateway` (default off, it costs money) gives private tasks a route to ECR, Secrets Manager and Logs in real AWS.
Outputs: VPC, subnet and security group ids, and `db_subnet_group_name`. Full table: `infra/modules/network/README.md`.

## `ecs-service` module contract (M7)
ECS Fargate service behind an ALB: cluster, task definition, service (private subnets, deployment circuit breaker with rollback), ALB with IP target group and HTTP listener, CloudWatch log group, and IAM roles.
The **execution role** pulls the image and writes logs; the **task role**, which the app runs as, may only read the DB secret.
The container gets `DB_SECRET_ID` (the secret ARN), `AWS_REGION`, the OTel settings and any extra environment, such as floci's endpoint locally.
Outputs: `alb_url`, cluster/service names, task definition ARN, log group, role ARNs. Full table: `infra/modules/ecs-service/README.md`.

## Running Terraform
Terraform runs **in a container** (`hashicorp/terraform:1.16.5`, Compose service `terraform`, profile `tools`), so nobody needs it installed.
Its entrypoint is `infra/scripts/terraform.sh`, which runs `init` and then the requested action on `envs/local`:

| Command | Does |
|---|---|
| `pnpm infra:up` | `docker compose run --rm terraform up` → `init` + `apply -auto-approve` |
| `pnpm infra:plan` | same, `plan` only |
| `pnpm infra:down` | `destroy -auto-approve` |
| `pnpm infra:ecs` / `infra:ecs:down` | M7: build, push and deploy the API to ECS on floci / destroy it (`envs/local-ecs`, `ecs-*` actions; see below) |

- Providers are downloaded into the `tf-data` volume (`TF_DATA_DIR`), not into the bind-mounted source tree. State lives in the `tf-state` volume.
- `.terraform.lock.hcl` is committed with hashes for linux/darwin (amd64 + arm64) and windows_amd64. To refresh it:
  `docker compose run --rm --no-deps --entrypoint terraform terraform providers lock -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_arm64 -platform=darwin_amd64 -platform=windows_amd64`
- The first `infra:up` takes about 1.5 minutes. floci makes the instance available in seconds, but the AWS provider polls on its own interval. Re-runs with nothing to change finish in seconds.
- `fmt`/`validate` without installing Terraform: `docker compose run --rm --no-deps --entrypoint terraform -w /infra terraform fmt -check -recursive`.

In full-stack Compose mode, the `bootstrap` service is this same Terraform container (see `local-dev/docker-compose.md`).

## M7: ECS on floci (stretch)
`pnpm infra:ecs` runs the API the way it would run in AWS: an image in ECR, an ECS Fargate service in private
subnets, behind an ALB. It needs only Docker or Podman (on Podman, prefix `DOCKER_BUILDKIT=0` as for Compose).
Script: `scripts/infra/ecs.ts`; Terraform root: `infra/envs/local-ecs` (own state volume `tf-ecs-state`).

1. **Data layer:** `docker compose up -d floci otel-lgtm`, then the `migrate` job. Through its dependencies this
   applies `envs/local` (RDS + DB secrets), then runs migrations and the seed. Idempotent.
2. **ECR:** `terraform apply -target=module.ecr`. The repository must exist before the push.
3. **Build:** `docker build --target runtime`, tagged `<git short sha>[-dirty]-<UTC timestamp>`, so every run is a new
   task definition revision. The build is tagged both `keyloop-api:<tag>` and with its full ECR name, because floci
   starts tasks through this engine and would otherwise try to pull over HTTPS from its plain-HTTP registry.
4. **Push:** `docker save`, then [crane](https://github.com/google/go-containerregistry/tree/main/cmd/crane) in a
   container on the Compose network pushes the tarball to floci ECR with `--insecure`. Same on every engine, and no
   daemon `insecure-registries` setting.
5. **Deploy:** `terraform apply` of `network` + `ecr` + `ecs-service` with `TF_VAR_image_tag`.
6. **Wait:** polls `http://localhost:8080/health` through the ALB until `db` is `up` (3 min timeout), then prints the
   URL, image, cluster/service and log group.

`pnpm infra:ecs:down` destroys the ECS stack (`envs/local-ecs`) and leaves the data layer.

| Local choice | Why |
|---|---|
| ALB listener on 8080, published on the `floci` service | floci opens listener ports inside its own container and can't bind below 1024. `aws-dev` uses 80 |
| Separate root and state (`envs/local-ecs`) | The ECS stack can be created and destroyed without touching the data layer. Its provider looks up the account id, which security group rules need for a clean plan, and switching that on in `envs/local` would break existing states |
| `AWS_ENDPOINT_URL` and dummy keys in the task environment | IAM isn't enforced on floci, so the task can't get credentials from its role. `aws-dev` passes none of these |
| `OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-lgtm:4318` | Tasks join the Compose network, so their traces, logs and metrics appear in the same Grafana |

What this proves and what it can't: [design-notes.md](design-notes.md) › Running on ECS (M7).

## Rules
- Pin Terraform and provider versions (`required_version`, `required_providers`). Commit `.terraform.lock.hcl`.
- No hard-coded secrets; passwords come from `random_password` and live only in Secrets Manager + state.
- Every resource is tagged (`project = "keyloop"`, `env`).
- Modules have `variables.tf`, `outputs.tf`, `versions.tf` and a short README.
- `envs/aws-dev` must always `validate`, even though it's never applied.
- CI checks: `terraform fmt -check -recursive`, `terraform validate` (both envs), `tflint`. Optional: `trivy config infra/` for misconfigurations.
