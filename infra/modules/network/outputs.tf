output "vpc_id" {
  description = "VPC id."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnets (ALB), one per AZ."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnets (ECS tasks, RDS), one per AZ."
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  description = "Security group for the ALB."
  value       = aws_security_group.alb.id
}

output "task_security_group_id" {
  description = "Security group for the API tasks."
  value       = aws_security_group.task.id
}

output "db_security_group_id" {
  description = "Security group for RDS; pass to the database module's vpc_security_group_ids."
  value       = aws_security_group.db.id
}

output "db_subnet_group_name" {
  description = "RDS subnet group over the private subnets; pass to the database module."
  value       = aws_db_subnet_group.this.name
}
