#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ] || [ "$#" -gt 3 ]; then
  printf 'Usage: %s <env-file> <env-vars-base64> [reserved-keys-comma-separated]\n' "$0" >&2
  exit 1
fi

ENV_FILE="$1"
ENV_VARS_B64="$2"
RESERVED_KEYS_CSV="${3:-}"
SCRIPT_DIR="$(cd -- "$(dirname "$0")" && pwd)"
UPSERT_SCRIPT="${SCRIPT_DIR}/upsert-env.sh"

if [ -z "$ENV_VARS_B64" ]; then
  exit 0
fi

if [ ! -f "$UPSERT_SCRIPT" ]; then
  printf 'Missing helper script: %s\n' "$UPSERT_SCRIPT" >&2
  exit 1
fi

declare -A RESERVED_KEYS=()

if [ -n "$RESERVED_KEYS_CSV" ]; then
  IFS=',' read -r -a RESERVED_KEYS_LIST <<< "$RESERVED_KEYS_CSV"
  for RESERVED_KEY in "${RESERVED_KEYS_LIST[@]}"; do
    if [ -n "$RESERVED_KEY" ]; then
      RESERVED_KEYS["$RESERVED_KEY"]=1
    fi
  done
fi

ENV_VARS_CONTENT="$(printf '%s' "$ENV_VARS_B64" | base64 -d)"

while IFS= read -r LINE || [ -n "$LINE" ]; do
  if [[ -z "$LINE" ]] || [[ "$LINE" =~ ^[[:space:]]*# ]]; then
    continue
  fi

  if [[ "$LINE" != *=* ]]; then
    printf 'Invalid env line (expected KEY=VALUE): %s\n' "$LINE" >&2
    exit 1
  fi

  KEY="${LINE%%=*}"
  VALUE="${LINE#*=}"

  if [[ ! "$KEY" =~ ^[A-Z0-9_]+$ ]]; then
    printf 'Invalid env key: %s\n' "$KEY" >&2
    exit 1
  fi

  if [[ -n "${RESERVED_KEYS[$KEY]:-}" ]]; then
    printf 'Refusing to override reserved env key: %s\n' "$KEY" >&2
    exit 1
  fi

  bash "$UPSERT_SCRIPT" "$ENV_FILE" "$KEY" "$VALUE"
done <<< "$ENV_VARS_CONTENT"
