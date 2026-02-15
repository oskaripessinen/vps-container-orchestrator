#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <app-slug>\n' "$0"
  exit 1
fi

APP_SLUG="$1"
BASE_DIR="${DEPLOY_HUB_DIR:-$HOME/deploy-hub}"
APP_DIR="${BASE_DIR}/apps/${APP_SLUG}"

if [ ! -f "${APP_DIR}/docker-compose.yml" ]; then
  printf 'Missing docker-compose.yml for app: %s\n' "$APP_SLUG"
  exit 1
fi

cd "$APP_DIR"
docker compose pull
docker compose up -d --remove-orphans
docker image prune -f

printf 'Deploy complete for %s\n' "$APP_SLUG"
