variable "name" {
  description = "Name of the cluster, service, task family, ALB and log group, e.g. keyloop-api."
  type        = string
}

variable "image" {
  description = "Full image reference with a unique tag, e.g. <ecr repository_url>:<git sha>."
  type        = string
}

variable "cpu" {
  description = "Task CPU units (Fargate sizes: 256, 512, 1024, ...)."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Task memory in MiB; must be valid for the chosen cpu."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of tasks to keep running."
  type        = number
  default     = 1
}

variable "container_port" {
  description = "Port the API listens on (the app's PORT)."
  type        = number
  default     = 3000
}

variable "listener_port" {
  description = "ALB listener port. floci can't open ports below 1024, so local uses 8080."
  type        = number
  default     = 80
}

variable "health_check_path" {
  description = "Path used by the ALB target group and the container health check."
  type        = string
  default     = "/health"
}

variable "vpc_id" {
  description = "VPC of the target group (network module output)."
  type        = string
}

variable "public_subnet_ids" {
  description = "Subnets for the ALB, at least two AZs (network module output)."
  type        = list(string)
}

variable "private_subnet_ids" {
  description = "Subnets for the tasks (network module output)."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group of the ALB (network module output)."
  type        = string
}

variable "task_security_group_id" {
  description = "Security group of the tasks (network module output)."
  type        = string
}

variable "assign_public_ip" {
  description = "Give tasks a public IP. Keep false: tasks sit in private subnets behind the ALB."
  type        = bool
  default     = false
}

variable "db_secret_arn" {
  description = "ARN of the DB secret. Passed to the app as DB_SECRET_ID; the task role may read only this secret."
  type        = string
}

variable "otel_exporter_otlp_endpoint" {
  description = "OTLP/HTTP collector for traces, logs and metrics. null disables telemetry."
  type        = string
  default     = null
}

variable "environment" {
  description = "Extra environment variables, e.g. AWS_ENDPOINT_URL for floci. Never put secrets here."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}

variable "wait_for_steady_state" {
  description = "Make apply wait until the service has its tasks running and healthy."
  type        = bool
  default     = false
}
