# floci only. No endpoints {} block: AWS_ENDPOINT_URL points the provider at floci
# (http://floci:4566 inside Compose, http://localhost:4566 from the host).
provider "aws" {
  region     = "us-east-1"
  access_key = "test" # floci dummy credentials, not a secret
  secret_key = "test"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  default_tags {
    tags = {
      project = "keyloop"
      env     = "local"
    }
  }
}

module "database" {
  source = "../../modules/database"

  name    = "keyloop"
  db_name = "keyloop"
  # The API on the host reaches floci's RDS proxy via localhost, the API container via the floci service name.
  secret_hosts = {
    local  = "localhost"
    docker = "floci"
  }
  skip_final_snapshot = true
}
