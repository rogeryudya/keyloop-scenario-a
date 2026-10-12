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
Same `database` module, no floci flags, credentials from the standard AWS chain. It takes an existing DB subnet group
and security groups as variables (`terraform.tfvars.example`); the network module that would create them is M7.
`secret_hosts` stays empty, so the app's secret is `keyloop-dev/db` holding the real instance address.
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

## Running Terraform
Terraform runs **in a container** (`hashicorp/terraform:1.16.5`, Compose service `terraform`, profile `tools`), so nobody needs it installed.
Its entrypoint is `infra/scripts/terraform.sh`, which runs `init` and then the requested action on `envs/local`:

| Command | Does |
|---|---|
| `pnpm infra:up` | `docker compose run --rm terraform up` → `init` + `apply -auto-approve` |
| `pnpm infra:plan` | same, `plan` only |
| `pnpm infra:down` | `destroy -auto-approve` |

- Providers are downloaded into the `tf-data` volume (`TF_DATA_DIR`), not into the bind-mounted source tree. State lives in the `tf-state` volume.
- `.terraform.lock.hcl` is committed with hashes for linux/darwin (amd64 + arm64) and windows_amd64. To refresh it:
  `docker compose run --rm --no-deps --entrypoint terraform terraform providers lock -platform=linux_amd64 -platform=linux_arm64 -platform=darwin_arm64 -platform=darwin_amd64 -platform=windows_amd64`
- The first `infra:up` takes about 1.5 minutes. floci makes the instance available in seconds, but the AWS provider polls on its own interval. Re-runs with nothing to change finish in seconds.
- `fmt`/`validate` without installing Terraform: `docker compose run --rm --no-deps --entrypoint terraform -w /infra terraform fmt -check -recursive`.

In full-stack Compose mode, the `bootstrap` service is this same Terraform container (see `local-dev/docker-compose.md`).

## M7: ECS on floci (stretch)
Flow, scripted as `pnpm infra:ecs`:
1. `terraform apply` the `ecr` module → repository URI.
2. `docker build --target runtime` → tag → `docker login` + `push` to floci ECR (`<account>.dkr.ecr.us-east-1.localhost:4566/keyloop-api`).
3. `terraform apply` `network` + `ecs-service` with the image tag. The task definition gets `DB_SECRET_ID` as an env var and the secret ARN via the execution role, the same as real AWS.
4. floci runs the task as a real container; the API is reachable via the ALB (or published awsvpc port).

What this proves: the image, task definition, IAM permissions for the secret, and env wiring are production-shaped. What it doesn't: real networking, scaling or IAM enforcement. Say so in the design notes.

## Rules
- Pin Terraform and provider versions (`required_version`, `required_providers`). Commit `.terraform.lock.hcl`.
- No hard-coded secrets; passwords come from `random_password` and live only in Secrets Manager + state.
- Every resource is tagged (`project = "keyloop"`, `env`).
- Modules have `variables.tf`, `outputs.tf`, `versions.tf` and a short README.
- `envs/aws-dev` must always `validate`, even though it's never applied.
- CI checks: `terraform fmt -check -recursive`, `terraform validate` (both envs), `tflint`. Optional: `trivy config infra/` for misconfigurations.
