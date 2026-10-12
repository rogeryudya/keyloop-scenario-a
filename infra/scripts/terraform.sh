#!/bin/sh
# Entrypoint of the Compose `terraform` service (pnpm infra:up|plan|down). Runs in envs/local against floci.
set -eu

terraform init -input=false

case "${1:-}" in
  up) terraform apply -auto-approve -input=false ;;
  plan) terraform plan -input=false ;;
  down) terraform destroy -auto-approve -input=false ;;
  *)
    echo "usage: terraform.sh up|plan|down" >&2
    exit 2
    ;;
esac
