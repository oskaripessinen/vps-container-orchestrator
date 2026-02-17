#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  printf 'Usage: %s <app-slug> <ghcr-image-with-tag> <internal-port>\n' "$0"
  exit 1
fi

APP_SLUG="$1"
APP_IMAGE="$2"
APP_INTERNAL_PORT="$3"
BASE_DIR="${DEPLOY_HUB_DIR:-$HOME/deploy-hub}"
APP_DIR="${BASE_DIR}/apps/${APP_SLUG}"

if [[ ! "$APP_SLUG" =~ ^[a-z0-9-]+$ ]]; then
  printf 'Invalid app slug: %s (allowed: lowercase letters, numbers, dash)\n' "$APP_SLUG"
  exit 1
fi

if [[ ! "$APP_INTERNAL_PORT" =~ ^[0-9]+$ ]] || [ "$APP_INTERNAL_PORT" -lt 1 ] || [ "$APP_INTERNAL_PORT" -gt 65535 ]; then
  printf 'Invalid internal port: %s\n' "$APP_INTERNAL_PORT"
  exit 1
fi

if [ ! -d "$BASE_DIR" ]; then
  printf 'Missing deploy hub directory: %s\n' "$BASE_DIR"
  exit 1
fi

if [ ! -f "${BASE_DIR}/scripts/create-app.sh" ] || [ ! -f "${BASE_DIR}/scripts/server-deploy.sh" ]; then
  printf 'Missing required deploy scripts under %s/scripts\n' "$BASE_DIR"
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  bash "${BASE_DIR}/scripts/create-app.sh" "$APP_SLUG" "$APP_IMAGE" "$APP_INTERNAL_PORT"
else
  cat >"${APP_DIR}/.env" <<EOF
APP_NAME=${APP_SLUG}
APP_IMAGE=${APP_IMAGE}
APP_INTERNAL_PORT=${APP_INTERNAL_PORT}
EOF
  printf 'Updated app env: %s/.env\n' "$APP_DIR"
fi

bash "${BASE_DIR}/scripts/server-deploy.sh" "$APP_SLUG"
