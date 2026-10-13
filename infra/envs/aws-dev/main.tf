# Real AWS. Credentials come from the standard AWS chain (SSO/env/role); nothing here is applied by this project
# (CI runs `init -backend=false` + `validate`). Same modules as envs/local + envs/local-ecs on floci.
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project = "keyloop"
      env     = "dev"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

module "network" {
  source = "../../modules/network"

  name       = "keyloop-dev"
  cidr_block = "10.10.0.0/16"
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
  # Tasks in private subnets need a route to ECR, Secrets Manager and CloudWatch Logs.
  enable_nat_gateway = true
  listener_port      = 80
}

module "database" {
  source = "../../modules/database"

  name           = "keyloop-dev"
  db_name        = "keyloop"
  instance_class = "db.t4g.micro"
  # secret_hosts left empty => one secret keyloop-dev/db holding the instance address.

  db_subnet_group_name   = module.network.db_subnet_group_name
  vpc_security_group_ids = [module.network.db_security_group_id]
  skip_final_snapshot    = false
}

module "ecr" {
  source = "../../modules/ecr"

  name = "keyloop-api"
  # IMMUTABLE tags (module default): a deploy pushes a new tag (git sha), so a tag always means one image.
}

module "api" {
  source = "../../modules/ecs-service"

  name          = "keyloop-api"
  image         = "${module.ecr.repository_url}:${var.image_tag}"
  desired_count = var.desired_count
  listener_port = 80

  vpc_id                 = module.network.vpc_id
  public_subnet_ids      = module.network.public_subnet_ids
  private_subnet_ids     = module.network.private_subnet_ids
  alb_security_group_id  = module.network.alb_security_group_id
  task_security_group_id = module.network.task_security_group_id

  # The only secret the task role may read. Credentials come from the task role: no keys, no endpoint override.
  db_secret_arn               = one(values(module.database.secret_arns))
  otel_exporter_otlp_endpoint = var.otel_exporter_otlp_endpoint
  wait_for_steady_state       = true
}
