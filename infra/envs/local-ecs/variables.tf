variable "image_tag" {
  description = "Tag of the API image in the ECR repository. Set by `pnpm infra:ecs` (git sha + timestamp)."
  type        = string
  default     = "not-built" # lets `ecs-repo` and `destroy` run before any image exists
}

variable "listener_port" {
  description = "ALB listener port, published on the floci service (floci can't open ports below 1024)."
  type        = number
  default     = 8080
}
