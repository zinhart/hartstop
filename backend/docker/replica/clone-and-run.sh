#!/usr/bin/env bash
set -euo pipefail

: "${REPL_USER:?missing}"
: "${REPL_PASSWORD:?missing}"
: "${PRIMARY_HOST:?missing}"
: "${PRIMARY_PORT:?missing}"
: "${SLOT_NAME:?missing}"
: "${PGDATA:?missing}"

# If PGDATA is empty -> fresh clone
if [ -z "$(ls -A "${PGDATA}" 2>/dev/null || true)" ]; then
  echo "Replica: empty PGDATA. Cloning from primary ${PRIMARY_HOST}:${PRIMARY_PORT} using slot ${SLOT_NAME}..."
  export PGPASSWORD="${REPL_PASSWORD}"

  # Ensure directory exists with correct perms
  mkdir -p "${PGDATA}"
  chmod 700 "${PGDATA}"

  pg_basebackup \
    -h "${PRIMARY_HOST}" \
    -p "${PRIMARY_PORT}" \
    -U "${REPL_USER}" \
    -D "${PGDATA}" \
    -Fp -Xs -R \
    -C -S "${SLOT_NAME}"

  # Optional tuning for replicas
  echo "hot_standby = on" >> "${PGDATA}/postgresql.auto.conf"
  echo "primary_conninfo = 'host=${PRIMARY_HOST} port=${PRIMARY_PORT} user=${REPL_USER} password=${REPL_PASSWORD} application_name=${SLOT_NAME}'" >> "${PGDATA}/postgresql.auto.conf"
  echo "shared_buffers = '512MB'" >> "${PGDATA}/postgresql.auto.conf"
  echo "effective_cache_size = '1GB'" >> "${PGDATA}/postgresql.auto.conf"

  unset PGPASSWORD
else
  echo "Replica: existing PGDATA found. Starting postgres."
fi

# Hand off to the default entrypoint (runs postgres)
exec docker-entrypoint.sh postgres
