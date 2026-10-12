variable "name" {
  description = "RDS instance identifier; also the prefix of the secret names (<name>/<suffix>/db)."
  type        = string
}

variable "engine_version" {
  description = "Postgres major version. Keep in sync with Testcontainers (test/helpers/postgres.ts)."
  type        = string
  default     = "17"
}

variable "instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Storage in GiB."
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Database created on the instance."
  type        = string
}

variable "username" {
  description = "Master username."
  type        = string
  default     = "keyloop"
}

variable "secret_hosts" {
  description = <<-EOT
    Map of secret suffix => host written into that secret. Local only: floci's instance address is an internal
    container IP, so each consumer gets the host it can reach (e.g. { local = "localhost", docker = "floci" }).
    Empty (real AWS) => a single secret <name>/db holding the instance address.
  EOT
  type        = map(string)
  default     = {}
}

variable "skip_final_snapshot" {
  description = "Skip the final snapshot on destroy. True for throwaway environments."
  type        = bool
  default     = false
}
