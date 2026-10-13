output "alb_dns_name" {
  description = "ALB DNS name (floci: a *.elb.floci name; reach it through the published listener port instead)."
  value       = aws_lb.this.dns_name
}

output "alb_url" {
  description = "Base URL of the API through the ALB."
  value       = "http://${aws_lb.this.dns_name}${var.listener_port == 80 ? "" : ":${var.listener_port}"}"
}

output "cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.this.name
}

output "task_definition_arn" {
  description = "Task definition ARN (with revision)."
  value       = aws_ecs_task_definition.this.arn
}

output "log_group_name" {
  description = "CloudWatch log group of the API."
  value       = aws_cloudwatch_log_group.this.name
}

output "task_role_arn" {
  description = "Role the app runs as (may read the DB secret only)."
  value       = aws_iam_role.task.arn
}

output "execution_role_arn" {
  description = "Role ECS uses to pull the image and write logs."
  value       = aws_iam_role.execution.arn
}
