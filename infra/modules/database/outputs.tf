output "endpoint" {
  description = "Instance address as reported by RDS (internal container IP on floci)."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Instance port (floci: the assigned proxy port)."
  value       = aws_db_instance.this.port
}

output "secret_arns" {
  description = "Secret ARNs keyed by secret name."
  value       = { for k, s in aws_secretsmanager_secret.db : s.name => s.arn }
}
