#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  printf 'Usage: %s <app-slug>\n' "$0"
  exit 1
fi

APP_SLUG="$1"
SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
BASE_DIR="${DEPLOY_HUB_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
APP_DIR="${BASE_DIR}/apps/${APP_SLUG}"

if [[ ! "$APP_SLUG" =~ ^[a-z0-9-]+$ ]]; then
  printf 'Invalid app slug: %s\n' "$APP_SLUG"
  exit 1
fi

if [ "$APP_SLUG" = "_template" ]; then
  printf 'Refusing to remove template app\n'
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  printf 'App directory not found: %s\n' "$APP_DIR"
  exit 1
fi

if [ ! -f "${APP_DIR}/.env" ]; then
  printf 'Missing .env for app: %s\n' "$APP_SLUG"
  exit 1
fi

set -a
. "${APP_DIR}/.env"
set +a

COMPOSE_PROJECT_NAME_VALUE="${APP_NAME:-$APP_SLUG}"

legacy_compose_project_name() {
  if [ -z "${COMPOSE_FILE:-}" ]; then
    return 0
  fi

  basename "$(dirname "$COMPOSE_FILE")"
}

if [ "${DEPLOY_MODE:-image}" = "compose" ]; then
  if [ -z "${COMPOSE_FILE:-}" ]; then
    printf 'Missing COMPOSE_FILE in %s/.env\n' "$APP_DIR"
    exit 1
  fi

  if [ ! -f "${APP_DIR}/${COMPOSE_FILE}" ]; then
    printf 'Missing compose file for app: %s\n' "${APP_DIR}/${COMPOSE_FILE}"
    exit 1
  fi

  if [ ! -f "${APP_DIR}/docker-compose.traefik.yml" ]; then
    printf 'Missing Traefik override for app: %s/docker-compose.traefik.yml\n' "$APP_DIR"
    exit 1
  fi

  LEGACY_COMPOSE_PROJECT_NAME="$(legacy_compose_project_name)"

  if [ -n "$LEGACY_COMPOSE_PROJECT_NAME" ] && [ "$LEGACY_COMPOSE_PROJECT_NAME" != "$COMPOSE_PROJECT_NAME_VALUE" ]; then
    docker compose \
      -p "$LEGACY_COMPOSE_PROJECT_NAME" \
      --env-file "${APP_DIR}/.env" \
      -f "${APP_DIR}/${COMPOSE_FILE}" \
      -f "${APP_DIR}/docker-compose.traefik.yml" \
      down --remove-orphans || true
  fi

  docker compose \
    -p "$COMPOSE_PROJECT_NAME_VALUE" \
    --env-file "${APP_DIR}/.env" \
    -f "${APP_DIR}/${COMPOSE_FILE}" \
    -f "${APP_DIR}/docker-compose.traefik.yml" \
    down --remove-orphans || true
else
  if [ -f "${APP_DIR}/docker-compose.yml" ]; then
    docker compose --env-file "${APP_DIR}/.env" -f "${APP_DIR}/docker-compose.yml" down --remove-orphans || true
  fi
fi

rm -rf "$APP_DIR"
docker image prune -f

printf 'Removed app: %s\n' "$APP_SLUG"
