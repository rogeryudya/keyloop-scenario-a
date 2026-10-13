# ecr module

A private container repository for the API image, with vulnerability scanning on push and a lifecycle
policy that keeps storage bounded. Used by `envs/local` (floci, M7) and `envs/aws-dev`.

| Input | Default | Notes |
|---|---|---|
| `name` | — | Repository name, e.g. `keyloop-api` |
| `image_tag_mutability` | `IMMUTABLE` | A tag always means the same image; deploy by unique tag (git sha). `MUTABLE` is allowed for local use |
| `scan_on_push` | `true` | Scan each pushed image |
| `max_image_count` | `10` | Keep the newest N images; older ones expire |
| `untagged_expiry_days` | `1` | Untagged images expire after this many days |
| `force_delete` | `false` | `true` for throwaway environments, so `destroy` works with images inside |

Outputs: `repository_url`, `repository_arn`, `repository_name`, `registry_id`.

On floci the repository URL is `000000000000.dkr.ecr.us-east-1.localhost:4566/<name>`, backed by a real
registry over plain HTTP (see `docs/milestones/m7-cloud-infra.md` › Notes).
