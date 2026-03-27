#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
BASE_DIR="${DEPLOY_HUB_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
APPS_DIR="${BASE_DIR}/apps"
INFRA_ENV_FILE="${BASE_DIR}/infrastructure/.env"
TEMPLATE_FILE="${BASE_DIR}/apps/_template/docker-compose.yml"
UPSERT_SCRIPT="${BASE_DIR}/scripts/upsert-env.sh"

resolve_base_domain() {
  local infra_env_file="$1"

  if [ ! -f "$infra_env_file" ]; then
    return 0
  fi

  grep -E '^BASE_DOMAIN=' "$infra_env_file" | tail -n 1 | cut -d= -f2- || true
}

if [ ! -d "$APPS_DIR" ]; then
  printf 'Missing apps directory: %s\n' "$APPS_DIR"
  exit 1
fi

if [ ! -f "$TEMPLATE_FILE" ]; then
  printf 'Missing app template: %s\n' "$TEMPLATE_FILE"
  exit 1
fi

if [ ! -f "$UPSERT_SCRIPT" ]; then
  printf 'Missing helper script: %s\n' "$UPSERT_SCRIPT"
  exit 1
fi

BASE_DOMAIN="$(resolve_base_domain "$INFRA_ENV_FILE")"

if [ -z "$BASE_DOMAIN" ]; then
  printf 'Missing BASE_DOMAIN in %s\n' "$INFRA_ENV_FILE"
  exit 1
fi

shopt -s nullglob

for APP_DIR in "$APPS_DIR"/*; do
  APP_SLUG="$(basename "$APP_DIR")"

  if [ ! -d "$APP_DIR" ] || [ "$APP_SLUG" = "_template" ]; then
    continue
  fi

  if [ ! -f "$APP_DIR/.env" ] || [ ! -f "$APP_DIR/docker-compose.yml" ]; then
    printf 'Skipping %s because .env or docker-compose.yml is missing\n' "$APP_SLUG"
    continue
  fi

  if ! grep -q '^APP_DOMAIN=' "$APP_DIR/.env"; then
    bash "$UPSERT_SCRIPT" "$APP_DIR/.env" APP_DOMAIN "${APP_SLUG}.${BASE_DOMAIN}"
  fi

  if ! grep -q 'traefik.enable=true' "$APP_DIR/docker-compose.yml"; then
    cp "$APP_DIR/docker-compose.yml" "$APP_DIR/docker-compose.pre-traefik.yml"
    cp "$TEMPLATE_FILE" "$APP_DIR/docker-compose.yml"
    printf 'Backed up %s/docker-compose.yml to docker-compose.pre-traefik.yml\n' "$APP_DIR"
  fi

  (
    cd "$APP_DIR"
    docker compose config >/dev/null
    docker compose up -d --remove-orphans
  )

  printf 'Traefik-ready app stack: %s\n' "$APP_SLUG"
done
