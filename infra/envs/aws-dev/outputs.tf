output "db_endpoint" {
  description = "RDS instance address."
  value       = module.database.endpoint
}

output "db_secret_arns" {
  description = "DB secret (name => ARN). The ECS task gets DB_SECRET_ID=keyloop-dev/db."
  value       = module.database.secret_arns
}
