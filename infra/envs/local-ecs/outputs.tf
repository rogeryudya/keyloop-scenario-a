output "repository_url" {
  description = "ECR repository for the API image (push with crane: see scripts/infra/ecs.ts)."
  value       = module.ecr.repository_url
}

output "image" {
  description = "Image the service runs."
  value       = "${module.ecr.repository_url}:${var.image_tag}"
}

output "local_url" {
  description = "The API through the ALB, from the host (listener port published on the floci service)."
  value       = "http://localhost:${var.listener_port}"
}

output "alb_dns_name" {
  description = "ALB DNS name as floci reports it (not resolvable from the host)."
  value       = module.api.alb_dns_name
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
  description = "CloudWatch log group of the API tasks."
  value       = module.api.log_group_name
}
