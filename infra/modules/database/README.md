# database module

Postgres on RDS plus its credentials in Secrets Manager, in the RDS secret format the app reads
(`engine, host, port, username, password, dbname`). Used by `envs/local` (floci) and `envs/aws-dev`.

| Input | Default | Notes |
|---|---|---|
| `name` | — | Instance identifier and secret name prefix |
| `db_name` | — | Database created on the instance |
| `engine_version` | `17` | Keep in sync with Testcontainers |
| `instance_class` | `db.t4g.micro` | |
| `allocated_storage` | `20` | GiB |
| `username` | `keyloop` | Master user |
| `secret_hosts` | `{}` | `suffix => host`, one secret `<name>/<suffix>/db` each. Empty: one secret `<name>/db` with the instance address |
| `db_subnet_group_name` | `null` | Private subnet group (real AWS) |
| `vpc_security_group_ids` | `[]` | Security groups (real AWS) |
| `skip_final_snapshot` | `false` | `true` for throwaway environments |

Outputs: `endpoint`, `port`, `secret_arns` (name => ARN).

The password comes from `random_password` and exists only in Secrets Manager and Terraform state.
Secrets are deleted without a recovery window so `destroy` followed by `apply` can reuse the names.
