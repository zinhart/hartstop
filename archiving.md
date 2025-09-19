# =====================================================================
# AV DB Archiving, Replay, and Rotation Commands
# Save this entire block as ops/archiving_replay.md (kept as shell-ready)
# =====================================================================

# ----------------------------- GLOBAL CONFIG -----------------------------
# Edit these once to match your environment.
DB_URL_PRIMARY="postgresql://user:pass@primary-host:5432/avdb?sslmode=require"
DB_URL_REPLICA="postgresql://user:pass@replica-host:5432/avdb?sslmode=require"

# S3 bucket (cold storage)
S3_BUCKET="s3://your-bucket/avdb"

# Retention windows (days) used by the rotation function
HOT_DAYS=180      # keep in HOT parent
WARM_DAYS=365     # keep in ARCHIVE parent before enqueueing for cold dump

# Optional tablespace for archive partitions (leave empty to skip)
ARCHIVE_TABLESPACE=""     # e.g., "slow_tier" or ""


# --------------------- ARCHIVE: DUMP → S3 → DROP -------------------------
# Dumps a single archived child table to S3 (from REPLICA), then confirms & drops it on PRIMARY.
# Usage:
#   dump_to_s3_and_drop public.agent_check_ins_archive_2025_01_01 agent_check_ins 2025-01-01
dump_to_s3_and_drop () {
  local CHILD_TABLE="$1"        # e.g., public.agent_check_ins_archive_2025_01_01
  local FAMILY="$2"             # e.g., agent_check_ins  (used only for S3 folder structure)
  local DATE_TAG="$3"           # e.g., 2025-01-01

  local S3_URI="${S3_BUCKET}/${FAMILY}/${DATE_TAG}/${CHILD_TABLE}.sql.gz"

  echo "==> Dumping ${CHILD_TABLE} from REPLICA and uploading to ${S3_URI}"
  set -euo pipefail
  pg_dump "$DB_URL_REPLICA" -t "$CHILD_TABLE" --no-owner --no-privileges \
    | gzip -9 \
    | aws s3 cp - "$S3_URI"

  echo "==> Marking dumped & dropping ${CHILD_TABLE} on PRIMARY"
  psql "$DB_URL_PRIMARY" -v ON_ERROR_STOP=1 \
    -c "SELECT confirm_partition_dump_and_drop('$CHILD_TABLE', '$S3_URI');"

  echo "==> Done."
}


# -------------------------- FULL-FIDELITY REPLAY -------------------------
# Restores a single archived partition back into the ARCHIVE parent (queryable immediately).
# Usage:
#   replay_from_s3 public.agent_check_ins_archive_2025_01_01 agent_check_ins 2025-01-01 2025-01-02
# Notes:
#   DAY_START_UTC inclusive, DAY_END_UTC exclusive; match original bounds exactly.
replay_from_s3 () {
  local CHILD_TABLE="$1"        # e.g., public.agent_check_ins_archive_2025_01_01
  local FAMILY="$2"             # e.g., agent_check_ins  (only for S3 folder layout)
  local DAY_START_UTC="$3"      # e.g., 2025-01-01 00:00:00+00
  local DAY_END_UTC="$4"        # e.g., 2025-01-02 00:00:00+00

  # Derive S3 path from CHILD_TABLE & DAY_START_UTC folder convention
  local DATE_TAG="${DAY_START_UTC%% *}"  # take 'YYYY-MM-DD' from start timestamp
  local S3_URI="${S3_BUCKET}/${FAMILY}/${DATE_TAG}/${CHILD_TABLE}.sql.gz"

  echo "==> Restoring ${CHILD_TABLE} from ${S3_URI} into staging schema 'replay'"
  set -euo pipefail
  psql "$DB_URL_PRIMARY" -v ON_ERROR_STOP=1 -c "CREATE SCHEMA IF NOT EXISTS replay;"

  aws s3 cp "$S3_URI" - | gunzip \
    | psql "$DB_URL_PRIMARY" -v ON_ERROR_STOP=1 --set=search_path=replay

  echo "==> Moving table to public and ATTACHING to archive parent with original bounds"
  psql "$DB_URL_PRIMARY" -v ON_ERROR_STOP=1 <<SQL
BEGIN;
  -- Move restored table into public
  ALTER TABLE replay$(echo "$CHILD_TABLE" | sed -E 's/^public//') SET SCHEMA public;

  -- Determine parent from CHILD_TABLE prefix (before last date suffix)
  -- Example: public.agent_check_ins_archive_2025_01_01 -> parent: public.agent_check_ins_archive
  DO \$\$
  DECLARE
    v_child text := '$CHILD_TABLE';
    v_parent text := regexp_replace('$CHILD_TABLE', '_[0-9]{4}_[0-9]{2}_[0-9]{2}$', '');
  BEGIN
    EXECUTE format('ALTER TABLE %s ATTACH PARTITION %s FOR VALUES FROM (%L) TO (%L)',
                   v_parent, v_child, '$DAY_START_UTC', '$DAY_END_UTC');
  END
  \$\$;

  -- Best-effort per-partition index (if columns exist)
  DO \$\$
  BEGIN
    BEGIN
      EXECUTE 'CREATE INDEX IF NOT EXISTS ' ||
              regexp_replace('$CHILD_TABLE','^public\.','') || '_agent_time_idx ON $CHILD_TABLE (agent_uuid, created_at DESC)';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END
  \$\$;
COMMIT;
SQL

  echo "==> Replay complete. Data is visible via the vw_*_all view(s)."
}


# ------------------------- ROTATION (one step) --------------------------
# Calls the generalized SQL function rotate_partition_set to:
#   1) Move one eligible HOT child -> ARCHIVE (detach→attach→index→optional tablespace)
#   2) Or enqueue one ARCHIVE child older than warm window for dumping (ops log + NOTIFY)
# Usage:
#   rotate_once public.agent_check_ins public.agent_check_ins_archive
rotate_once () {
  local HOT_PARENT="$1"
  local ARCH_PARENT="$2"

  local TS_SQL="NULL"
  if [[ -n "$ARCHIVE_TABLESPACE" ]]; then
    TS_SQL="'${ARCHIVE_TABLESPACE}'"
  fi

  echo "==> Rotating: $HOT_PARENT → $ARCH_PARENT  (HOT=${HOT_DAYS}d, WARM=${WARM_DAYS}d, TS=${ARCHIVE_TABLESPACE:-none})"
  set -euo pipefail
  psql "$DB_URL_PRIMARY" -v ON_ERROR_STOP=1 -c \
    "SELECT rotate_partition_set('$HOT_PARENT'::regclass, '$ARCH_PARENT'::regclass, $HOT_DAYS, $WARM_DAYS, ${TS_SQL});"
  echo "==> Rotation step done (if any work was available)."
}

# Convenience wrapper to rotate all fact families once (idempotent, tiny locks)
rotate_all_facts_once () {
  rotate_once "public.agent_check_ins"       "public.agent_check_ins_archive"
  rotate_once "public.agent_tasking_history" "public.agent_tasking_history_archive"
  rotate_once "public.dirwalks"              "public.dirwalks_archive"
}


# ------------------------- OPTIONAL: LISTENER ---------------------------
# Prototype listener for NOTIFY 'partition_dump' events (JSON payload).
# In production, use a small daemon (Python/Go/Node) that LISTENs and runs dumps.
# Usage:
#   listen_partition_dump
listen_partition_dump () {
  echo "==> Listening for NOTIFY partition_dump (Ctrl+C to exit)"
  psql "$DB_URL_PRIMARY" -v ON_ERROR_STOP=1 <<'SQL'
LISTEN partition_dump;
-- Refresh output every second to show notifications:
\watch 1
SQL
}


# ============================ EXAMPLES ==================================
# 1) Rotate once for all fact tables (run this every 5 minutes via cron/systemd)
# rotate_all_facts_once

# 2) Dump a specific archived partition day to S3, then drop it
# dump_to_s3_and_drop public.agent_check_ins_archive_2025_01_01 agent_check_ins 2025-01-01

# 3) Full-fidelity replay of a day (back into archive parent)
# replay_from_s3 public.agent_check_ins_archive_2025_01_01 agent_check_ins "2025-01-01 00:00:00+00" "2025-01-02 00:00:00+00"

# 4) Start a simple console listener for partition_dump events
# listen_partition_dump


# ============================== CRON ====================================
# Example crontab (every 5 minutes) to advance rotation in tiny steps:
# */5 * * * * /usr/bin/env bash -lc 'source /path/to/ops/archiving_replay.md; rotate_all_facts_once >> /var/log/rotate_partitions.log 2>&1'

# If your cron cannot 'source' a .md, copy this block to a .sh file, make it executable,
# and call functions from there, or wrap the one-liners you need.
