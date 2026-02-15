#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  printf 'Usage: %s <app-slug> <ghcr-image> <internal-port>\n' "$0"
  exit 1
fi

APP_SLUG="$1"
APP_IMAGE="$2"
APP_PORT="$3"
BASE_DIR="${DEPLOY_HUB_DIR:-$(pwd)}"
APP_DIR="${BASE_DIR}/apps/${APP_SLUG}"

if [ -e "$APP_DIR" ]; then
  printf 'App directory already exists: %s\n' "$APP_DIR"
  exit 1
fi

mkdir -p "$APP_DIR"
cp "${BASE_DIR}/apps/_template/docker-compose.yml" "${APP_DIR}/docker-compose.yml"

cat >"${APP_DIR}/.env" <<EOF
APP_NAME=${APP_SLUG}
APP_IMAGE=${APP_IMAGE}
APP_INTERNAL_PORT=${APP_PORT}
EOF

printf 'Created app directory: %s\n' "$APP_DIR"
printf 'Next: bash scripts/server-deploy.sh %s\n' "$APP_SLUG"
