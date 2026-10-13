terraform {
  required_version = ">= 1.16.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.68"
    }
  }

  # Its own state, separate from envs/local (data layer): mounted as the tf-ecs-state volume through Compose.
  backend "local" {
    path = "state/terraform.tfstate"
  }
}
