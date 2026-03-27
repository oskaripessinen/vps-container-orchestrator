#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  printf 'Usage: %s <app-slug> <ghcr-image-with-tag> <internal-port>\n' "$0"
  exit 1
fi

APP_SLUG="$1"
APP_IMAGE="$2"
APP_INTERNAL_PORT="$3"
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

sync_traefik_template() {
  local app_dir="$1"
  local template_file="${BASE_DIR}/apps/_template/docker-compose.yml"
  local backup_file="${app_dir}/docker-compose.pre-traefik.yml"

  if [ ! -f "${app_dir}/docker-compose.yml" ]; then
    cp "$template_file" "${app_dir}/docker-compose.yml"
    printf 'Created Traefik app template: %s\n' "${app_dir}/docker-compose.yml"
    return 0
  fi

  if grep -q 'traefik.enable=true' "${app_dir}/docker-compose.yml"; then
    return 0
  fi

  cp "${app_dir}/docker-compose.yml" "$backup_file"
  cp "$template_file" "${app_dir}/docker-compose.yml"
  printf 'Updated Traefik app template: %s\n' "${app_dir}/docker-compose.yml"
}

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

if [ ! -f "$UPSERT_SCRIPT" ]; then
  printf 'Missing helper script under %s\n' "$UPSERT_SCRIPT"
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  bash "${BASE_DIR}/scripts/create-app.sh" "$APP_SLUG" "$APP_IMAGE" "$APP_INTERNAL_PORT"
else
  touch "${APP_DIR}/.env"
  bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_NAME "$APP_SLUG"
  bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_IMAGE "$APP_IMAGE"
  bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_INTERNAL_PORT "$APP_INTERNAL_PORT"

  if ! grep -q '^APP_DOMAIN=' "${APP_DIR}/.env"; then
    BASE_DOMAIN="$(resolve_base_domain "$INFRA_ENV_FILE")"

    if [ -z "$BASE_DOMAIN" ]; then
      printf 'Missing APP_DOMAIN in %s/.env and BASE_DOMAIN in %s\n' "$APP_DIR" "$INFRA_ENV_FILE"
      exit 1
    fi

    bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_DOMAIN "${APP_SLUG}.${BASE_DOMAIN}"
  fi

  sync_traefik_template "$APP_DIR"
  printf 'Updated app env: %s/.env\n' "$APP_DIR"
fi

bash "${BASE_DIR}/scripts/server-deploy.sh" "$APP_SLUG"
