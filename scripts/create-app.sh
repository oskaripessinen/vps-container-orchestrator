#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  printf 'Usage: %s <app-slug> <ghcr-image> <internal-port> [app-domain]\n' "$0"
  exit 1
fi

APP_SLUG="$1"
APP_IMAGE="$2"
APP_PORT="$3"
APP_DOMAIN_OVERRIDE="${4:-}"
SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
BASE_DIR="${DEPLOY_HUB_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
APP_DIR="${BASE_DIR}/apps/${APP_SLUG}"
INFRA_ENV_FILE="${BASE_DIR}/infrastructure/.env"
UPSERT_SCRIPT="${BASE_DIR}/scripts/upsert-env.sh"

resolve_base_domain() {
  local infra_env_file="$1"

  if [ ! -f "$infra_env_file" ]; then
    return 0
  fi

  grep -E '^BASE_DOMAIN=' "$infra_env_file" | tail -n 1 | cut -d= -f2- || true
}

if [[ ! "$APP_SLUG" =~ ^[a-z0-9-]+$ ]]; then
  printf 'Invalid app slug: %s (allowed: lowercase letters, numbers, dash)\n' "$APP_SLUG"
  exit 1
fi

if [[ ! "$APP_PORT" =~ ^[0-9]+$ ]] || [ "$APP_PORT" -lt 1 ] || [ "$APP_PORT" -gt 65535 ]; then
  printf 'Invalid internal port: %s\n' "$APP_PORT"
  exit 1
fi

if [ -e "$APP_DIR" ]; then
  printf 'App directory already exists: %s\n' "$APP_DIR"
  exit 1
fi

if [ ! -f "$UPSERT_SCRIPT" ]; then
  printf 'Missing helper script: %s\n' "$UPSERT_SCRIPT"
  exit 1
fi

APP_DOMAIN="$APP_DOMAIN_OVERRIDE"

if [ -z "$APP_DOMAIN" ]; then
  BASE_DOMAIN="$(resolve_base_domain "$INFRA_ENV_FILE")"

  if [ -z "$BASE_DOMAIN" ]; then
    printf 'Missing app domain. Pass [app-domain] or set BASE_DOMAIN in %s\n' "$INFRA_ENV_FILE"
    exit 1
  fi

  APP_DOMAIN="${APP_SLUG}.${BASE_DOMAIN}"
fi

mkdir -p "$APP_DIR"
cp "${BASE_DIR}/apps/_template/docker-compose.yml" "${APP_DIR}/docker-compose.yml"
touch "${APP_DIR}/.env"

bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_NAME "$APP_SLUG"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_IMAGE "$APP_IMAGE"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_INTERNAL_PORT "$APP_PORT"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_DOMAIN "$APP_DOMAIN"

printf 'Created app directory: %s\n' "$APP_DIR"
printf 'App domain: https://%s\n' "$APP_DOMAIN"
printf 'Next: bash scripts/server-deploy.sh %s\n' "$APP_SLUG"
