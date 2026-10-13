variable "name" {
  description = "Name prefix for every resource, e.g. keyloop-dev."
  type        = string
}

variable "cidr_block" {
  description = "VPC CIDR. Each AZ gets one public and one private /24 carved from it."
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.cidr_block, 0))
    error_message = "cidr_block must be a valid IPv4 CIDR, e.g. 10.0.0.0/16."
  }
}

variable "azs" {
  description = "Availability zones; one public and one private subnet each. An ALB needs at least two."
  type        = list(string)
  default     = ["us-east-1a", "us-east-1b"]

  validation {
    condition     = length(var.azs) >= 2
    error_message = "azs needs at least two zones (an ALB spans two or more)."
  }
}

variable "enable_nat_gateway" {
  description = <<-EOT
    One NAT gateway so tasks in private subnets can reach ECR, Secrets Manager and CloudWatch Logs.
    Needed in real AWS (or VPC endpoints instead). It costs money, so it is off by default.
  EOT
  type        = bool
  default     = false
}

variable "listener_port" {
  description = "Port the ALB listens on; opened in the ALB security group."
  type        = number
  default     = 80
}

variable "app_port" {
  description = "Container port of the API; opened to the ALB only."
  type        = number
  default     = 3000
}

variable "db_port" {
  description = "Postgres port; opened to the API tasks only."
  type        = number
  default     = 5432
}

variable "allowed_ingress_cidrs" {
  description = "CIDRs allowed to reach the ALB listener."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}
