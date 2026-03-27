#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 6 ] || [ "$#" -gt 8 ]; then
  printf 'Usage: %s <app-slug> <source-owner> <source-repo> <source-ref> <compose-file-path> <internal-port> [public-service-name] [env-vars-base64]\n' "$0"
  exit 1
fi

APP_SLUG="$1"
SOURCE_OWNER="$2"
SOURCE_REPO="$3"
SOURCE_REF="$4"
COMPOSE_FILE_PATH="$5"
APP_INTERNAL_PORT="$6"
PUBLIC_SERVICE_NAME="${7:-}"
ENV_VARS_B64="${8:-}"
SOURCE_GITHUB_TOKEN="${SOURCE_GITHUB_TOKEN:-}"

SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
BASE_DIR="${DEPLOY_HUB_DIR:-$(cd -- "$SCRIPT_DIR/.." && pwd)}"
APP_DIR="${BASE_DIR}/apps/${APP_SLUG}"
SOURCE_DIR="${APP_DIR}/source-repo"
INFRA_ENV_FILE="${BASE_DIR}/infrastructure/.env"
UPSERT_SCRIPT="${BASE_DIR}/scripts/upsert-env.sh"
SERVER_DEPLOY_SCRIPT="${BASE_DIR}/scripts/server-deploy.sh"
TRAEFIK_OVERRIDE_FILE="${APP_DIR}/docker-compose.traefik.yml"
APPLY_ENV_SCRIPT="${BASE_DIR}/scripts/apply-app-env-vars.sh"

RESERVED_APP_KEYS="APP_NAME,APP_IMAGE,APP_INTERNAL_PORT,APP_DOMAIN,DEPLOY_MODE,COMPOSE_FILE,PUBLIC_SERVICE_NAME,SOURCE_REPOSITORY,SOURCE_REF"

resolve_base_domain() {
  local infra_env_file="$1"

  if [ ! -f "$infra_env_file" ]; then
    return 0
  fi

  grep -E '^BASE_DOMAIN=' "$infra_env_file" | tail -n 1 | cut -d= -f2- || true
}

detect_public_service() {
  local compose_file="$1"

  ruby -ryaml -e '
    preferred = %w[api app web backend server frontend]
    config = YAML.load_file(ARGV[0]) || {}
    services = config["services"]
    abort("Missing services in compose file") unless services.is_a?(Hash) && !services.empty?

    service_names = services.keys.map(&:to_s)
    selected = preferred.find { |name| service_names.include?(name) } || service_names.first
    puts selected
  ' "$compose_file"
}

if [[ ! "$APP_SLUG" =~ ^[a-z0-9-]+$ ]]; then
  printf 'Invalid app slug: %s\n' "$APP_SLUG"
  exit 1
fi

if [[ ! "$SOURCE_OWNER" =~ ^[A-Za-z0-9_.-]+$ ]] || [[ ! "$SOURCE_REPO" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  printf 'Invalid repository: %s/%s\n' "$SOURCE_OWNER" "$SOURCE_REPO"
  exit 1
fi

if [[ ! "$APP_INTERNAL_PORT" =~ ^[0-9]+$ ]] || [ "$APP_INTERNAL_PORT" -lt 1 ] || [ "$APP_INTERNAL_PORT" -gt 65535 ]; then
  printf 'Invalid internal port: %s\n' "$APP_INTERNAL_PORT"
  exit 1
fi

if [ -z "$SOURCE_REF" ]; then
  printf 'Source ref is required\n'
  exit 1
fi

if [[ "$COMPOSE_FILE_PATH" = /* ]] || [[ "$COMPOSE_FILE_PATH" == *".."* ]]; then
  printf 'Invalid compose file path: %s\n' "$COMPOSE_FILE_PATH"
  exit 1
fi

if [ ! -f "$UPSERT_SCRIPT" ] || [ ! -f "$SERVER_DEPLOY_SCRIPT" ]; then
  printf 'Missing required deploy scripts under %s/scripts\n' "$BASE_DIR"
  exit 1
fi

if [ ! -f "$APPLY_ENV_SCRIPT" ]; then
  printf 'Missing required helper script under %s\n' "$APPLY_ENV_SCRIPT"
  exit 1
fi

BASE_DOMAIN="$(resolve_base_domain "$INFRA_ENV_FILE")"

if [ -z "$BASE_DOMAIN" ]; then
  printf 'Missing BASE_DOMAIN in %s\n' "$INFRA_ENV_FILE"
  exit 1
fi

APP_DOMAIN="${APP_SLUG}.${BASE_DOMAIN}"

PUBLIC_REPO_URL="https://github.com/${SOURCE_OWNER}/${SOURCE_REPO}.git"

if [ -n "$SOURCE_GITHUB_TOKEN" ]; then
  SOURCE_REPO_URL="https://x-access-token:${SOURCE_GITHUB_TOKEN}@github.com/${SOURCE_OWNER}/${SOURCE_REPO}.git"
else
  SOURCE_REPO_URL="$PUBLIC_REPO_URL"
fi

mkdir -p "$APP_DIR"

if [ -d "$SOURCE_DIR/.git" ]; then
  git -C "$SOURCE_DIR" remote set-url origin "$SOURCE_REPO_URL"
  git -C "$SOURCE_DIR" fetch --depth 1 origin "$SOURCE_REF"
  git -C "$SOURCE_DIR" checkout --force FETCH_HEAD
  git -C "$SOURCE_DIR" clean -fd
else
  rm -rf "$SOURCE_DIR"
  git clone --no-checkout "$SOURCE_REPO_URL" "$SOURCE_DIR"
  git -C "$SOURCE_DIR" fetch --depth 1 origin "$SOURCE_REF"
  git -C "$SOURCE_DIR" checkout --force FETCH_HEAD
fi

git -C "$SOURCE_DIR" remote set-url origin "$PUBLIC_REPO_URL"

COMPOSE_ABS_PATH="${SOURCE_DIR}/${COMPOSE_FILE_PATH}"

if [ ! -f "$COMPOSE_ABS_PATH" ]; then
  printf 'Missing compose file after checkout: %s\n' "$COMPOSE_ABS_PATH"
  exit 1
fi

if [ -z "$PUBLIC_SERVICE_NAME" ]; then
  PUBLIC_SERVICE_NAME="$(detect_public_service "$COMPOSE_ABS_PATH")"
fi

if [ -z "$PUBLIC_SERVICE_NAME" ]; then
  printf 'Could not detect public compose service\n'
  exit 1
fi

touch "${APP_DIR}/.env"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_NAME "$APP_SLUG"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_DOMAIN "$APP_DOMAIN"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" APP_INTERNAL_PORT "$APP_INTERNAL_PORT"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" DEPLOY_MODE compose
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" COMPOSE_FILE "source-repo/${COMPOSE_FILE_PATH}"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" PUBLIC_SERVICE_NAME "$PUBLIC_SERVICE_NAME"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" SOURCE_REPOSITORY "${SOURCE_OWNER}/${SOURCE_REPO}"
bash "$UPSERT_SCRIPT" "${APP_DIR}/.env" SOURCE_REF "$SOURCE_REF"
bash "$APPLY_ENV_SCRIPT" "${APP_DIR}/.env" "$ENV_VARS_B64" "$RESERVED_APP_KEYS"

cat > "$TRAEFIK_OVERRIDE_FILE" <<EOF
services:
  ${PUBLIC_SERVICE_NAME}:
    networks:
      - default
      - shared-network
    labels:
      - "orchestrator.app-slug=${APP_SLUG}"
      - "traefik.enable=true"
      - "traefik.docker.network=vps-container-orchestrator"
      - "traefik.http.routers.${APP_SLUG}.rule=Host(\`${APP_DOMAIN}\`)"
      - "traefik.http.routers.${APP_SLUG}.entrypoints=websecure"
      - "traefik.http.routers.${APP_SLUG}.tls.certresolver=letsencrypt"
      - "traefik.http.routers.${APP_SLUG}.service=${APP_SLUG}"
      - "traefik.http.services.${APP_SLUG}.loadbalancer.server.port=${APP_INTERNAL_PORT}"

networks:
  shared-network:
    external: true
    name: vps-container-orchestrator
EOF

printf 'Prepared compose app: %s\n' "$APP_SLUG"
printf 'Source repository: %s/%s @ %s\n' "$SOURCE_OWNER" "$SOURCE_REPO" "$SOURCE_REF"
printf 'Compose file: %s\n' "$COMPOSE_FILE_PATH"
printf 'Public service: %s\n' "$PUBLIC_SERVICE_NAME"
printf 'App domain: https://%s\n' "$APP_DOMAIN"

bash "$SERVER_DEPLOY_SCRIPT" "$APP_SLUG"
