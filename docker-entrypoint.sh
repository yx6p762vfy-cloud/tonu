#!/bin/sh
set -eu

# Render (and some volume drivers) mount disks owned by root. Fix ownership
# once per boot, then run the app as the unprivileged node user.
if [ "$(id -u)" = "0" ]; then
  : "${DATA_DIR:=/app/data}"
  : "${UPLOADS_DIR:=/app/uploads}"
  mkdir -p "$DATA_DIR" "$UPLOADS_DIR"
  chown node:node "$DATA_DIR" "$UPLOADS_DIR"
  exec gosu node "$@"
fi

exec "$@"
