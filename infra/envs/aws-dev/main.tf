# Real AWS. Credentials come from the standard AWS chain (SSO/env/role); nothing here is applied by this project.
provider "aws" {
  region = var.region

  default_tags {
    tags = {
      project = "keyloop"
      env     = "dev"
    }
  }
}

module "database" {
  source = "../../modules/database"

  name           = "keyloop-dev"
  db_name        = "keyloop"
  instance_class = "db.t4g.micro"
  # secret_hosts left empty => one secret keyloop-dev/db holding the instance address.

  db_subnet_group_name   = var.db_subnet_group_name
  vpc_security_group_ids = var.db_security_group_ids
  skip_final_snapshot    = false
}
