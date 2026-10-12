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

  # state/ is git-ignored and mounted as the tf-state volume when run through Compose.
  backend "local" {
    path = "state/terraform.tfstate"
  }
}
