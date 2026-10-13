locals {
  # Public subnets x.x.0.0/24, x.x.1.0/24, ...; private subnets from x.x.100.0/24 on.
  public_cidrs  = [for i, _ in var.azs : cidrsubnet(var.cidr_block, 8, i)]
  private_cidrs = [for i, _ in var.azs : cidrsubnet(var.cidr_block, 8, 100 + i)]
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = { Name = var.name }
}

# --- public subnets: ALB and NAT gateway
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = var.name }
}

resource "aws_subnet" "public" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.this.id
  availability_zone = var.azs[count.index]
  cidr_block        = local.public_cidrs[count.index]
  tags              = { Name = "${var.name}-public-${var.azs[count.index]}", tier = "public" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-public" }
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# --- private subnets: ECS tasks and RDS, no inbound route from the internet
resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.this.id
  availability_zone = var.azs[count.index]
  cidr_block        = local.private_cidrs[count.index]
  tags              = { Name = "${var.name}-private-${var.azs[count.index]}", tier = "private" }
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${var.name}-private" }
}

resource "aws_route_table_association" "private" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# One NAT gateway, not one per AZ: enough for a dev environment at a fraction of the cost.
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? 1 : 0
  domain = "vpc"
  tags   = { Name = "${var.name}-nat" }
}

resource "aws_nat_gateway" "this" {
  count         = var.enable_nat_gateway ? 1 : 0
  allocation_id = aws_eip.nat[0].id
  subnet_id     = aws_subnet.public[0].id
  tags          = { Name = var.name }
  depends_on    = [aws_internet_gateway.this]
}

resource "aws_route" "private_nat" {
  count                  = var.enable_nat_gateway ? 1 : 0
  route_table_id         = aws_route_table.private.id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[0].id
}

# --- security groups: internet -> ALB -> tasks -> DB, each hop open to the previous one only
resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "ALB: listener port from allowed CIDRs"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb_listener" {
  for_each          = toset(var.allowed_ingress_cidrs)
  security_group_id = aws_security_group.alb.id
  description       = "HTTP to the listener"
  ip_protocol       = "tcp"
  from_port         = var.listener_port
  to_port           = var.listener_port
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_egress_rule" "alb_to_tasks" {
  security_group_id            = aws_security_group.alb.id
  description                  = "Forward to API tasks"
  ip_protocol                  = "tcp"
  from_port                    = var.app_port
  to_port                      = var.app_port
  referenced_security_group_id = aws_security_group.task.id
}

resource "aws_security_group" "task" {
  name        = "${var.name}-task"
  description = "API tasks: app port from the ALB only"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-task" }
}

resource "aws_vpc_security_group_ingress_rule" "task_from_alb" {
  security_group_id            = aws_security_group.task.id
  description                  = "From the ALB"
  ip_protocol                  = "tcp"
  from_port                    = var.app_port
  to_port                      = var.app_port
  referenced_security_group_id = aws_security_group.alb.id
}

# Tasks call AWS APIs (ECR, Secrets Manager, CloudWatch Logs) over HTTPS.
resource "aws_vpc_security_group_egress_rule" "task_https" {
  security_group_id = aws_security_group.task.id
  description       = "HTTPS to AWS APIs"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "task_to_db" {
  security_group_id            = aws_security_group.task.id
  description                  = "Postgres"
  ip_protocol                  = "tcp"
  from_port                    = var.db_port
  to_port                      = var.db_port
  referenced_security_group_id = aws_security_group.db.id
}

resource "aws_security_group" "db" {
  name        = "${var.name}-db"
  description = "RDS: Postgres from API tasks only"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${var.name}-db" }
}

resource "aws_vpc_security_group_ingress_rule" "db_from_tasks" {
  security_group_id            = aws_security_group.db.id
  description                  = "From API tasks"
  ip_protocol                  = "tcp"
  from_port                    = var.db_port
  to_port                      = var.db_port
  referenced_security_group_id = aws_security_group.task.id
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = aws_subnet.private[*].id
  tags       = { Name = var.name }
}
