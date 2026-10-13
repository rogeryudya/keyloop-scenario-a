output "api_url" {
  description = "The API through the ALB (HTTP; HTTPS needs an ACM certificate and a domain)."
  value       = module.api.alb_url
}

output "repository_url" {
  description = "ECR repository the pipeline pushes the API image to."
  value       = module.ecr.repository_url
}

output "cluster_name" {
  description = "ECS cluster."
  value       = module.api.cluster_name
}

output "service_name" {
  description = "ECS service."
  value       = module.api.service_name
}

output "log_group_name" {
  description = "CloudWatch log group of the API."
  value       = module.api.log_group_name
}

output "db_endpoint" {
  description = "RDS instance address (private subnets)."
  value       = module.database.endpoint
}

output "db_secret_arns" {
  description = "DB secret (name => ARN), passed to the tasks as DB_SECRET_ID."
  value       = module.database.secret_arns
}
