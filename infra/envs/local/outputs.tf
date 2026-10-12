output "db_port" {
  description = "floci RDS proxy port for the instance."
  value       = module.database.port
}

output "db_secret_arns" {
  description = "DB secrets (name => ARN). DB_SECRET_ID=keyloop/local/db on the host, keyloop/docker/db in Compose."
  value       = module.database.secret_arns
}
