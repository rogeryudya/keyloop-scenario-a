locals {
  # "" => <name>/db (real AWS); otherwise <name>/<suffix>/db with a host override.
  secret_hosts = length(var.secret_hosts) > 0 ? var.secret_hosts : { "" = aws_db_instance.this.address }
}

# Alphanumeric only: RDS rejects some symbols and the app builds a connection URL from it.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_db_instance" "this" {
  identifier          = var.name
  engine              = "postgres"
  engine_version      = var.engine_version
  instance_class      = var.instance_class
  allocated_storage   = var.allocated_storage
  storage_encrypted   = true
  db_name             = var.db_name
  username            = var.username
  password            = random_password.db.result
  publicly_accessible = false

  # Security groups: null (not []) when unset, since floci reports a placeholder group that [] would remove on every apply.
  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = length(var.vpc_security_group_ids) > 0 ? var.vpc_security_group_ids : null

  skip_final_snapshot       = var.skip_final_snapshot
  final_snapshot_identifier = var.skip_final_snapshot ? null : "${var.name}-final"
}

# Terraform-managed (not RDS-managed) so the secret holds the full RDS-format JSON the app expects.
resource "aws_secretsmanager_secret" "db" {
  for_each = local.secret_hosts

  name        = each.key == "" ? "${var.name}/db" : "${var.name}/${each.key}/db"
  description = "Postgres credentials for ${var.name} (RDS secret format)"
  # Delete immediately so destroy + apply can reuse the name.
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "db" {
  for_each = local.secret_hosts

  secret_id = aws_secretsmanager_secret.db[each.key].id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = each.value
    port     = aws_db_instance.this.port # floci assigns a proxy port (7001-7099)
    username = aws_db_instance.this.username
    password = random_password.db.result
    dbname   = var.db_name
  })
}
