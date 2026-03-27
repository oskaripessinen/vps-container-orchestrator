#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 3 ]; then
  printf 'Usage: %s <env-file> <key> <value>\n' "$0" >&2
  exit 1
fi

ENV_FILE="$1"
KEY="$2"
VALUE="$3"

if [[ ! "$KEY" =~ ^[A-Z0-9_]+$ ]]; then
  printf 'Invalid env key: %s\n' "$KEY" >&2
  exit 1
fi

if [[ "$VALUE" == *$'\n'* ]]; then
  printf 'Multiline values are not supported for %s\n' "$KEY" >&2
  exit 1
fi

ENV_DIR="$(dirname "$ENV_FILE")"
TMP_FILE="$(mktemp)"

cleanup() {
  rm -f "$TMP_FILE"
}

trap cleanup EXIT

mkdir -p "$ENV_DIR"

if [ -f "$ENV_FILE" ]; then
  grep -v -E "^${KEY}=" "$ENV_FILE" > "$TMP_FILE" || true
fi

printf '%s=%s\n' "$KEY" "$VALUE" >> "$TMP_FILE"
chmod 600 "$TMP_FILE"
mv "$TMP_FILE" "$ENV_FILE"
