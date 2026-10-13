#!/bin/sh
# Entrypoint of the Compose `terraform` service.
#   up | plan | down                  envs/local: RDS + DB secrets (pnpm infra:up|plan|down)
#   ecs-repo | ecs-up | ecs-plan | ecs-down | ecs-output <name>
#                                     envs/local-ecs: ECR + ECS + ALB (pnpm infra:ecs, infra:ecs:down)
# Each root has its own state volume and its own TF_DATA_DIR, so their providers and backends don't mix.
set -eu

action="${1:-}"
case "$action" in
  ecs-*)
    cd /infra/envs/local-ecs
    export TF_DATA_DIR=/tf-data/local-ecs
    ;;
esac

if [ "$action" = ecs-output ]; then
  # Quiet, so the caller can capture the value.
  terraform init -input=false > /dev/null
else
  terraform init -input=false
fi

case "$action" in
  up) terraform apply -auto-approve -input=false ;;
  plan) terraform plan -input=false ;;
  down) terraform destroy -auto-approve -input=false ;;
  # The repository must exist before the image can be pushed, and the service needs the image.
  ecs-repo) terraform apply -auto-approve -input=false -target=module.ecr ;;
  ecs-up) terraform apply -auto-approve -input=false ;;
  ecs-plan) terraform plan -input=false ;;
  ecs-down) terraform destroy -auto-approve -input=false ;;
  ecs-output) terraform output -raw "${2:?usage: terraform.sh ecs-output <name>}" ;;
  *)
    echo "usage: terraform.sh up|plan|down|ecs-repo|ecs-up|ecs-plan|ecs-down|ecs-output <name>" >&2
    exit 2
    ;;
esac
