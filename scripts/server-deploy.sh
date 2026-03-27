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
    pull \
    --ignore-pull-failures || true

  docker compose \
    -p "$COMPOSE_PROJECT_NAME_VALUE" \
    --env-file "${APP_DIR}/.env" \
    -f "${APP_DIR}/${COMPOSE_FILE}" \
    -f "${APP_DIR}/docker-compose.traefik.yml" \
    up -d --build --remove-orphans

  docker image prune -f
  printf 'Compose deploy complete for %s\n' "$APP_SLUG"
  exit 0
fi

if [ ! -f "${APP_DIR}/docker-compose.yml" ]; then
  printf 'Missing docker-compose.yml for app: %s\n' "$APP_SLUG"
  exit 1
fi

cd "$APP_DIR"
docker compose --env-file "${APP_DIR}/.env" pull
docker compose --env-file "${APP_DIR}/.env" up -d --remove-orphans
docker image prune -f

printf 'Deploy complete for %s\n' "$APP_SLUG"
