variable "region" {
  description = "AWS region. The first two available AZs are used."
  type        = string
  default     = "us-east-1"
}

variable "image_tag" {
  description = "Tag of the API image in ECR, set by the deploy pipeline (the git sha)."
  type        = string
}

variable "desired_count" {
  description = "API tasks to run; 2 spreads them over both AZs."
  type        = number
  default     = 2
}

variable "otel_exporter_otlp_endpoint" {
  description = "OTLP/HTTP collector for traces, logs and metrics (e.g. a Datadog Agent or ADOT collector). null: off."
  type        = string
  default     = null
}
