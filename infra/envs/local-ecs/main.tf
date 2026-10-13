# M7: the API on ECS Fargate behind an ALB, on floci. Run through `pnpm infra:ecs` (build, push, apply, wait).
# The data layer (RDS + DB secret) comes from envs/local, applied first by the same command.
provider "aws" {
  region     = "us-east-1"
  access_key = "test" # floci dummy credentials, not a secret
  secret_key = "test"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  # No skip_requesting_account_id: security group rules that reference another group need the account id
  # to read back cleanly (see infra/modules/network/README.md).

  default_tags {
    tags = {
      project = "keyloop"
      env     = "local"
    }
  }
}

# Created by envs/local. Its host is `floci`, which the ECS tasks resolve on the Compose network.
data "aws_secretsmanager_secret" "db" {
  name = "keyloop/docker/db"
}

module "network" {
  source = "../../modules/network"

  name          = "keyloop-local"
  listener_port = var.listener_port
  # No NAT gateway: on floci the tasks reach AWS APIs and RDS over the Compose network.
}

module "ecr" {
  source = "../../modules/ecr"

  name = "keyloop-api"
  # Every deploy pushes a new unique tag, so IMMUTABLE would also work; MUTABLE lets you re-push by hand.
  image_tag_mutability = "MUTABLE"
  force_delete         = true
}

module "api" {
  source = "../../modules/ecs-service"

  name                   = "keyloop-api"
  image                  = "${module.ecr.repository_url}:${var.image_tag}"
  listener_port          = var.listener_port
  vpc_id                 = module.network.vpc_id
  public_subnet_ids      = module.network.public_subnet_ids
  private_subnet_ids     = module.network.private_subnet_ids
  alb_security_group_id  = module.network.alb_security_group_id
  task_security_group_id = module.network.task_security_group_id
  db_secret_arn          = data.aws_secretsmanager_secret.db.arn

  otel_exporter_otlp_endpoint = "http://otel-lgtm:4318"
  # IAM isn't enforced on floci, so the task can't get credentials from its role: pass floci's endpoint and
  # dummy keys instead. Real AWS (envs/aws-dev) needs none of these.
  environment = {
    AWS_ENDPOINT_URL      = "http://floci:4566"
    AWS_ACCESS_KEY_ID     = "test"
    AWS_SECRET_ACCESS_KEY = "test"
  }
}
