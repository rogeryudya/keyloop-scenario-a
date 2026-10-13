output "repository_url" {
  description = "Image name without a tag, e.g. <account>.dkr.ecr.<region>.amazonaws.com/keyloop-api (floci: ...localhost:4566/...)."
  value       = aws_ecr_repository.this.repository_url
}

output "repository_arn" {
  description = "Repository ARN, for IAM policies."
  value       = aws_ecr_repository.this.arn
}

output "repository_name" {
  description = "Repository name."
  value       = aws_ecr_repository.this.name
}

output "registry_id" {
  description = "Account id that owns the registry."
  value       = aws_ecr_repository.this.registry_id
}
