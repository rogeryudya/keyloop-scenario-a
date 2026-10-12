variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "db_subnet_group_name" {
  description = "Existing DB subnet group in private subnets (the network module arrives in M7)."
  type        = string
}

variable "db_security_group_ids" {
  description = "Security groups allowing Postgres from the API tasks only."
  type        = list(string)
}
