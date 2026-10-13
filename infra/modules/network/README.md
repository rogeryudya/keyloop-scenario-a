# network module

The VPC the API runs in, laid out the way a production service would be:

- **Public subnets** (one per AZ) with an internet gateway: the ALB, and the NAT gateway if enabled.
- **Private subnets** (one per AZ), with no inbound route from the internet: the ECS tasks and RDS.
- **Security groups that chain hop by hop:** internet → ALB (listener port, from `allowed_ingress_cidrs`) →
  tasks (app port, from the ALB only) → RDS (Postgres, from the tasks only). Tasks may also call AWS APIs over
  HTTPS.
- **An RDS subnet group** over the private subnets, for the `database` module.

| Input | Default | Notes |
|---|---|---|
| `name` | — | Name prefix, e.g. `keyloop-dev` |
| `cidr_block` | `10.0.0.0/16` | Public subnets get `x.x.0.0/24`, `x.x.1.0/24` …; private ones `x.x.100.0/24` … |
| `azs` | `["us-east-1a", "us-east-1b"]` | At least two (an ALB spans two or more zones) |
| `enable_nat_gateway` | `false` | One NAT gateway so private tasks can reach ECR, Secrets Manager and Logs. Needed in real AWS (or VPC endpoints instead); it costs money |
| `listener_port` | `80` | ALB listener; floci can't open ports below 1024, so local uses 8080 |
| `app_port` | `3000` | API container port |
| `db_port` | `5432` | Postgres |
| `allowed_ingress_cidrs` | `["0.0.0.0/0"]` | Who may reach the ALB |

Outputs: `vpc_id`, `public_subnet_ids`, `private_subnet_ids`, `alb_security_group_id`, `task_security_group_id`,
`db_security_group_id`, `db_subnet_group_name`.

Security group rules use the standalone `aws_vpc_security_group_*_rule` resources, one rule each, as the AWS
provider recommends.

The provider must be allowed to look up its account id (no `skip_requesting_account_id`). Without it, rules that
reference another security group show a diff on every plan, because the read-back id is account-qualified.
