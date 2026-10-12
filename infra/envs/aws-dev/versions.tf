terraform {
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9"
    }
  }

  # Real-AWS shape only: never initialised against AWS in this project (CI runs `init -backend=false` + validate).
  # S3-native locking (use_lockfile) replaces the deprecated DynamoDB lock table.
  backend "s3" {
    bucket       = "keyloop-terraform-state"
    key          = "aws-dev/terraform.tfstate"
    region       = "us-east-1"
    encrypt      = true
    use_lockfile = true
  }
}
