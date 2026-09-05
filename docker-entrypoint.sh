#!/bin/sh
set -eu

DB_PATH="${PIT_DB_PATH:-/data/pit.sqlite}"
DB_DIR=$(dirname "$DB_PATH")
mkdir -p "$DB_DIR"

if [ "$(id -u)" = "0" ]; then
  if ! chown node:node "$DB_DIR" 2>/dev/null; then
    chmod 777 "$DB_DIR"
  fi
  if [ "$#" -gt 0 ]; then
    exec gosu node "$@"
  fi
  exec gosu node node server.js
fi

if [ "$#" -gt 0 ]; then
  exec "$@"
fi
exec node server.js
