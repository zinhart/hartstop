#!/usr/bin/env bash
set -euo pipefail

# This runs during the official image's init phase.
# Allow replication connections from any container on the bridge network (172.16.0.0/12 typical docker ranges).
# Adjust the CIDR to your docker network if needed (check `docker network inspect`).
PGDATA="${PGDATA:-/var/lib/postgresql/data}"

cat >> "${PGDATA}/pg_hba.conf" <<'EOF'
# Allow replication user from docker network (demo range; tighten in prod)
host    replication     replicator      0.0.0.0/0            scram-sha-256
host    all             all             0.0.0.0/0            scram-sha-256
EOF

# reload to pick up pg_hba changes
psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -c "SELECT pg_reload_conf();"
