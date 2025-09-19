-- =====================================================================
-- Hartstop C5 Platform DB
-- Single-file install: core schema, partitioning (pg_partman),
-- hot→warm→cold rotation, replay-ready archives, and operational helpers.
-- =====================================================================

-- =========================== Extensions ==============================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gin;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- Partition automation:
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- ============================= Types =================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'platform_enum') THEN
    CREATE TYPE platform_enum AS ENUM ('win', 'lin', 'osx', 'net');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'agent_type_enum') THEN
    CREATE TYPE agent_type_enum AS ENUM ('trigger', 'beacon', 'trigger_beacon');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'account_status_enum') THEN
    CREATE TYPE account_status_enum AS ENUM ('enabled', 'disabled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_enum') THEN
    CREATE TYPE role_enum AS ENUM ('Analyst', 'Operator', 'Admin');
  END IF;
END$$;

-- ====================== Security / Engagements =======================
CREATE TABLE IF NOT EXISTS users (
  user_uuid       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  account_status  account_status_enum NOT NULL DEFAULT 'enabled',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS engagements (
  engagement_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_name TEXT NOT NULL UNIQUE,
  start_ts        TIMESTAMPTZ NOT NULL,
  end_ts          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_ts IS NULL OR end_ts > start_ts)
);

CREATE TABLE IF NOT EXISTS engagement_users (
  engagement_uuid UUID NOT NULL REFERENCES engagements(engagement_uuid) ON DELETE CASCADE,
  user_uuid       UUID NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
  PRIMARY KEY (engagement_uuid, user_uuid)
);

-- Optional per-engagement or global roles
CREATE TABLE IF NOT EXISTS user_roles (
  user_uuid       UUID NOT NULL REFERENCES users(user_uuid) ON DELETE CASCADE,
  role            role_enum NOT NULL,
  engagement_uuid UUID REFERENCES engagements(engagement_uuid) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_uuid, role, engagement_uuid)
);

CREATE TABLE IF NOT EXISTS last_login (
  user_uuid  UUID PRIMARY KEY REFERENCES users(user_uuid) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================= Tasking ===============================
CREATE TABLE IF NOT EXISTS tasking (
  task_uuid       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_long_name  TEXT NOT NULL UNIQUE,
  task_permission role_enum NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_overrides (
  engagement_uuid UUID NOT NULL REFERENCES engagements(engagement_uuid) ON DELETE CASCADE,
  task_uuid       UUID NOT NULL REFERENCES tasking(task_uuid) ON DELETE CASCADE,
  min_role        role_enum NOT NULL,
  PRIMARY KEY (engagement_uuid, task_uuid)
);

-- =========================== Load Balancers ==========================
CREATE TABLE IF NOT EXISTS load_balancers (
  load_balancers_uuid UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_uuid     UUID REFERENCES engagements(engagement_uuid) ON DELETE SET NULL,
  first_hop           TEXT,
  second_hop          TEXT,
  third_hop           TEXT,
  last_hop            TEXT,
  CONSTRAINT lb_nonempty CHECK (
    COALESCE(first_hop,'') <> '' OR COALESCE(second_hop,'') <> '' OR
    COALESCE(third_hop,'') <> '' OR COALESCE(last_hop,'') <> ''
  )
);

-- ========================= Agent Configuration =======================
CREATE TABLE IF NOT EXISTS agent_configuration (
  build_uuid            UUID PRIMARY KEY,        -- provided by build system
  build_configuration   JSONB NOT NULL,
  platform              platform_enum NOT NULL,
  type                  agent_type_enum NOT NULL,
  self_uninstall_sec    INTEGER,                 -- seconds until self-removal (nullable)
  checkin_interval_sec  INTEGER,                 -- required for beacon & trigger_beacon
  load_balancers_uuid   UUID REFERENCES load_balancers(load_balancers_uuid) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (type IN ('beacon','trigger_beacon') AND checkin_interval_sec IS NOT NULL)
    OR (type = 'trigger' AND checkin_interval_sec IS NULL)
  ),
  CHECK (self_uninstall_sec IS NULL OR self_uninstall_sec >= 0)
);

-- Capability sets
CREATE TABLE IF NOT EXISTS agent_config_supported_tasks (
  build_uuid UUID NOT NULL REFERENCES agent_configuration(build_uuid) ON DELETE CASCADE,
  task_uuid  UUID NOT NULL REFERENCES tasking(task_uuid) ON DELETE RESTRICT,
  PRIMARY KEY (build_uuid, task_uuid)
);

-- Configured ⊆ Supported (via composite FK)
CREATE TABLE IF NOT EXISTS agent_config_configured_tasks (
  build_uuid UUID NOT NULL,
  task_uuid  UUID NOT NULL,
  PRIMARY KEY (build_uuid, task_uuid),
  FOREIGN KEY (build_uuid, task_uuid)
    REFERENCES agent_config_supported_tasks(build_uuid, task_uuid)
    ON DELETE CASCADE
);

-- ============================ Agent (core) ===========================
CREATE TABLE IF NOT EXISTS agent_core (
  agent_uuid               UUID PRIMARY KEY, -- provided by agent
  agent_configuration_uuid UUID NOT NULL REFERENCES agent_configuration(build_uuid) ON DELETE RESTRICT,
  last_seen                TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  uninstall_date           TIMESTAMPTZ
);

-- Maintain uninstall_date = created_at + self_uninstall_sec (if present)
CREATE OR REPLACE FUNCTION set_agent_uninstall_date()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE secs INTEGER;
BEGIN
  SELECT self_uninstall_sec INTO secs
  FROM agent_configuration
  WHERE build_uuid = NEW.agent_configuration_uuid;

  IF secs IS NOT NULL THEN
    NEW.uninstall_date := NEW.created_at + make_interval(secs => secs);
  ELSE
    NEW.uninstall_date := NULL;
  END IF;

  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_agent_set_uninstall ON agent_core;
CREATE TRIGGER trg_agent_set_uninstall
BEFORE INSERT OR UPDATE OF agent_configuration_uuid, created_at
ON agent_core
FOR EACH ROW
EXECUTE FUNCTION set_agent_uninstall_date();

-- =========================== Endpoints (dim) =========================
CREATE TABLE IF NOT EXISTS endpoints (
  endpoint_uuid          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engagement_uuid        UUID NOT NULL REFERENCES engagements(engagement_uuid) ON DELETE CASCADE,
  agent_uuid             UUID REFERENCES agent_core(agent_uuid) ON DELETE SET NULL,
  os_version             TEXT,
  ip                     INET[] NOT NULL DEFAULT '{}',
  system_info            JSONB,
  gateway                INET[] NOT NULL DEFAULT '{}',
  routing_table          JSONB,
  arp                    JSONB,
  installed_applications JSONB,
  drivers                JSONB,
  patch_history          JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== Facts (partitioned by day) ====================

-- 1) Agent Check-ins (hot parent managed by pg_partman)
CREATE TABLE IF NOT EXISTS agent_check_ins (
  agent_uuid  UUID NOT NULL REFERENCES agent_core(agent_uuid) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2) Tasking History (hot parent)
CREATE TABLE IF NOT EXISTS agent_tasking_history (
  agent_uuid    UUID NOT NULL REFERENCES agent_core(agent_uuid) ON DELETE CASCADE,
  operator_uuid UUID NOT NULL REFERENCES users(user_uuid) ON DELETE RESTRICT,
  task_uuid     UUID NOT NULL REFERENCES tasking(task_uuid) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Dirwalk Snapshots (hot parent; large JSON payloads)
CREATE TABLE IF NOT EXISTS dirwalks (
  engagement_uuid UUID NOT NULL REFERENCES engagements(engagement_uuid) ON DELETE CASCADE,
  agent_uuid      UUID NOT NULL REFERENCES agent_core(agent_uuid) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload         JSONB NOT NULL
);

-- Archive parents (warm, queryable)
CREATE TABLE IF NOT EXISTS agent_check_ins_archive (
  agent_uuid UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS agent_tasking_history_archive (
  agent_uuid    UUID NOT NULL,
  operator_uuid UUID NOT NULL,
  task_uuid     UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS dirwalks_archive (
  engagement_uuid UUID NOT NULL,
  agent_uuid      UUID NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL,
  payload         JSONB NOT NULL
) PARTITION BY RANGE (created_at);

-- ================= API Idempotency ===========
CREATE TABLE IF NOT EXISTS api_idempotency (
  key TEXT PRIMARY KEY,
  status SMALLINT NOT NULL, -- 1=processing, 2=done
  response_etag TEXT,
  response_body JSONB,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS api_idempotency_created_idx ON api_idempotency (created_at);



-- ========================== pg_partman setup =========================
-- Hot parents: daily interval, premake 7 days; RETENTION: detach only (keep_table=true)
SELECT partman.create_parent(
  p_parent_table := 'public.agent_check_ins',
  p_control      := 'created_at',
  p_type         := 'native',
  p_interval     := 'daily',
  p_premake      := 7,
  p_automatic_maintenance := 'on'
)
WHERE NOT EXISTS (
  SELECT 1 FROM partman.part_config WHERE parent_table = 'public.agent_check_ins'
);

INSERT INTO partman.part_config (parent_table, retention, retention_keep_table)
VALUES ('public.agent_check_ins', '180 days', true)
ON CONFLICT (parent_table) DO UPDATE
SET retention = EXCLUDED.retention, retention_keep_table = true;

SELECT partman.create_parent(
  p_parent_table := 'public.agent_tasking_history',
  p_control      := 'created_at',
  p_type         := 'native',
  p_interval     := 'daily',
  p_premake      := 7,
  p_automatic_maintenance := 'on'
)
WHERE NOT EXISTS (
  SELECT 1 FROM partman.part_config WHERE parent_table = 'public.agent_tasking_history'
);

INSERT INTO partman.part_config (parent_table, retention, retention_keep_table)
VALUES ('public.agent_tasking_history', '180 days', true)
ON CONFLICT (parent_table) DO UPDATE
SET retention = EXCLUDED.retention, retention_keep_table = true;

SELECT partman.create_parent(
  p_parent_table := 'public.dirwalks',
  p_control      := 'created_at',
  p_type         := 'native',
  p_interval     := 'daily',
  p_premake      := 7,
  p_automatic_maintenance := 'on'
)
WHERE NOT EXISTS (
  SELECT 1 FROM partman.part_config WHERE parent_table = 'public.dirwalks'
);

INSERT INTO partman.part_config (parent_table, retention, retention_keep_table)
VALUES ('public.dirwalks', '90 days', true)
ON CONFLICT (parent_table) DO UPDATE
SET retention = EXCLUDED.retention, retention_keep_table = true;

-- Optional global BRINs on parents (cheap wide scans)
CREATE INDEX IF NOT EXISTS aci_parent_brin   ON agent_check_ins USING BRIN (created_at);
CREATE INDEX IF NOT EXISTS ath_parent_brin   ON agent_tasking_history USING BRIN (created_at);
CREATE INDEX IF NOT EXISTS dir_parent_brin   ON dirwalks USING BRIN (created_at);

-- ============================== Views ================================
CREATE OR REPLACE VIEW vw_agent_latest_checkin AS
SELECT a.agent_uuid, max(c.created_at) AS latest_checkin
FROM agent_core a
LEFT JOIN agent_check_ins c USING (agent_uuid)
GROUP BY a.agent_uuid;

CREATE OR REPLACE VIEW vw_agent_config_summary AS
SELECT a.agent_uuid, a.created_at AS agent_created_at, a.last_seen, a.uninstall_date,
       ac.build_uuid, ac.platform, ac.type, ac.self_uninstall_sec, ac.checkin_interval_sec,
       ac.load_balancers_uuid
FROM agent_core a
JOIN agent_configuration ac ON ac.build_uuid = a.agent_configuration_uuid;

CREATE OR REPLACE VIEW vw_config_tasks AS
SELECT ac.build_uuid, t.task_uuid, t.task_long_name,
       (s.task_uuid IS NOT NULL) AS is_supported,
       (c.task_uuid IS NOT NULL) AS is_configured
FROM agent_configuration ac
CROSS JOIN tasking t
LEFT JOIN agent_config_supported_tasks s
  ON s.build_uuid = ac.build_uuid AND s.task_uuid = t.task_uuid
LEFT JOIN agent_config_configured_tasks c
  ON c.build_uuid = ac.build_uuid AND c.task_uuid = t.task_uuid;

-- Unified “hot + warm” views for facts
CREATE OR REPLACE VIEW vw_agent_check_ins_all AS
SELECT * FROM agent_check_ins
UNION ALL
SELECT * FROM agent_check_ins_archive;

CREATE OR REPLACE VIEW vw_agent_tasking_history_all AS
SELECT * FROM agent_tasking_history
UNION ALL
SELECT * FROM agent_tasking_history_archive;

CREATE OR REPLACE VIEW vw_dirwalks_all AS
SELECT * FROM dirwalks
UNION ALL
SELECT * FROM dirwalks_archive;

-- ============================= Indexes ===============================
-- Users
CREATE INDEX IF NOT EXISTS users_status_idx   ON users (account_status);
CREATE INDEX IF NOT EXISTS users_created_idx  ON users (created_at DESC);

-- Engagement relations
CREATE INDEX IF NOT EXISTS engagement_users_user_idx ON engagement_users (user_uuid);
CREATE INDEX IF NOT EXISTS user_roles_user_idx       ON user_roles (user_uuid, engagement_uuid);

-- Tasking lookup
CREATE INDEX IF NOT EXISTS tasking_perm_idx  ON tasking (task_permission);
CREATE INDEX IF NOT EXISTS task_override_idx ON task_overrides (engagement_uuid, task_uuid);

-- Agent / config
CREATE INDEX IF NOT EXISTS agent_cfg_idx       ON agent_core (agent_configuration_uuid);
CREATE INDEX IF NOT EXISTS agent_last_seen_idx ON agent_core (last_seen DESC);
CREATE INDEX IF NOT EXISTS agent_uninstall_idx ON agent_core (uninstall_date);

-- Config JSONB queries
CREATE INDEX IF NOT EXISTS agent_cfg_buildconf_gin ON agent_configuration USING GIN (build_configuration jsonb_path_ops);

-- Endpoints & inventories
CREATE INDEX IF NOT EXISTS endpoints_agent_idx     ON endpoints (agent_uuid);
CREATE INDEX IF NOT EXISTS endpoints_engagement_idx ON endpoints (engagement_uuid);
CREATE INDEX IF NOT EXISTS endpoints_ip_gin         ON endpoints USING GIN (ip);
CREATE INDEX IF NOT EXISTS endpoints_gateway_gin    ON endpoints USING GIN (gateway);
CREATE INDEX IF NOT EXISTS endpoints_sysinfo_gin    ON endpoints USING GIN (system_info jsonb_path_ops);
CREATE INDEX IF NOT EXISTS endpoints_apps_gin       ON endpoints USING GIN (installed_applications jsonb_path_ops);
CREATE INDEX IF NOT EXISTS endpoints_drivers_gin    ON endpoints USING GIN (drivers jsonb_path_ops);
CREATE INDEX IF NOT EXISTS endpoints_patchhist_gin  ON endpoints USING GIN (patch_history jsonb_path_ops);

-- =================== Ops log & notification channel ==================
-- Channel name used: 'partition_dump'
-- Ops log keeps lifecycle of partitions to be dumped/dropped
CREATE TABLE IF NOT EXISTS partition_archive_ops (
  id              BIGSERIAL PRIMARY KEY,
  parent_table    TEXT NOT NULL,
  child_table     TEXT NOT NULL,
  range_start     TIMESTAMPTZ NOT NULL,
  range_end       TIMESTAMPTZ NOT NULL,
  s3_uri          TEXT,
  status          TEXT NOT NULL DEFAULT 'ready_to_dump', -- ready_to_dump | dumping | dumped | dropped | error
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION partition_archive_ops_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_partition_archive_ops_touch ON partition_archive_ops;
CREATE TRIGGER trg_partition_archive_ops_touch
BEFORE UPDATE ON partition_archive_ops
FOR EACH ROW EXECUTE FUNCTION partition_archive_ops_touch();



-- ================= Generalized rotation & archive function ===========
-- Detach old HOT partition -> attach to ARCHIVE -> (optional) move tablespace
-- Then, for ARCHIVE partitions older than warm window: enqueue NOTIFY + ops log
-- Processes at most ONE step per call to keep locks tiny.
CREATE OR REPLACE FUNCTION rotate_partition_set(
  p_hot_parent      regclass,
  p_archive_parent  regclass,
  p_hot_days        integer,             -- days kept hot
  p_warm_days       integer,             -- days kept warm (in archive) before dump
  p_tablespace      text DEFAULT NULL    -- e.g., 'slow_tier' (optional)
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_hot_parent    text := p_hot_parent::text;
  v_arch_parent   text := p_archive_parent::text;
  r               record;
  v_child         text;
  v_start         timestamptz;
  v_end           timestamptz;
  v_archive_child text;
BEGIN
  -- Step 1: Move one eligible HOT child to ARCHIVE
  FOR r IN
    SELECT c.oid::regclass::text AS child_name,
           pg_get_expr(c.relpartbound, c.oid, true) AS bound
    FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = split_part(v_hot_parent, '.', 2)
    ORDER BY c.relname
  LOOP
    v_child := r.child_name;
    v_start := (regexp_match(r.bound, $$FROM \('([^']+)'\)$$))[1]::timestamptz;
    v_end   := (regexp_match(r.bound, $$TO \('([^']+)'\)$$))[1]::timestamptz;

    IF v_end <= date_trunc('day', now() - make_interval(days => p_hot_days)) THEN
      -- Detach from hot
      EXECUTE format('ALTER TABLE %s DETACH PARTITION %s', v_hot_parent, v_child);

      -- Prepare archive child name (predictable)
      v_archive_child := replace(v_child, split_part(v_hot_parent, '.', 2) || '_', split_part(v_arch_parent, '.', 2) || '_');

      -- Ensure archive child exists & attach with same bounds
      EXECUTE format('CREATE TABLE IF NOT EXISTS %s (LIKE %s INCLUDING ALL)', v_archive_child, v_child);
      EXECUTE format('ALTER TABLE %s ATTACH PARTITION %s FOR VALUES FROM (%L) TO (%L)',
                     v_arch_parent, v_archive_child, v_start, v_end);

      -- Per-partition index for common queries
      -- Try standard name; if schema differs, it's fine (IF NOT EXISTS)
      BEGIN
        EXECUTE format('CREATE INDEX IF NOT EXISTS %I_agent_time_idx ON %s (agent_uuid, created_at DESC)',
                       split_part(v_archive_child, '.', 2), v_archive_child);
      EXCEPTION WHEN OTHERS THEN
        -- Not all tables have (agent_uuid, created_at); best-effort only
        NULL;
      END;

      -- Optional: move to slower tablespace (and its index)
      IF p_tablespace IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %s SET TABLESPACE %I', v_archive_child, p_tablespace);
        BEGIN
          EXECUTE format('ALTER INDEX %I_agent_time_idx SET TABLESPACE %I',
                         split_part(v_archive_child, '.', 2), p_tablespace);
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END IF;

      RETURN; -- one partition per call
    END IF;
  END LOOP;

  -- Step 2: Enqueue one ARCHIVE child older than warm window for dumping
  FOR r IN
    SELECT c.oid::regclass::text AS child_name,
           pg_get_expr(c.relpartbound, c.oid, true) AS bound
    FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = split_part(v_arch_parent, '.', 2)
  LOOP
    v_child := r.child_name;
    v_start := (regexp_match(r.bound, $$FROM \('([^']+)'\)$$))[1]::timestamptz;
    v_end   := (regexp_match(r.bound, $$TO \('([^']+)'\)$$))[1]::timestamptz;

    IF v_end <= date_trunc('day', now() - make_interval(days => p_warm_days)) THEN
      -- Upsert an ops record in ready_to_dump
      INSERT INTO partition_archive_ops(parent_table, child_table, range_start, range_end, status)
      VALUES (v_arch_parent, v_child, v_start, v_end, 'ready_to_dump')
      ON CONFLICT DO NOTHING;

      -- Notify external archiver
      PERFORM pg_notify(
        'partition_dump',
        json_build_object(
          'parent_table', v_arch_parent,
          'child_table',  v_child,
          'range_start',  v_start,
          'range_end',    v_end
        )::text
      );

      RETURN; -- one enqueue per call
    END IF;
  END LOOP;
END$$;

-- Helper: after successful dump, mark partition dumped and drop it.
CREATE OR REPLACE FUNCTION confirm_partition_dump_and_drop(
  p_child_table text,
  p_s3_uri      text
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE partition_archive_ops
     SET status = 'dumped',
         s3_uri = p_s3_uri
   WHERE child_table = p_child_table
     AND status IN ('ready_to_dump','dumping');

  -- Drop the archived partition (it is attached to archive parent)
  EXECUTE format('DROP TABLE IF EXISTS %s', p_child_table);

  UPDATE partition_archive_ops
     SET status = 'dropped'
   WHERE child_table = p_child_table
     AND status = 'dumped';
END$$;

-- ============================== Comments =============================
COMMENT ON SCHEMA public IS
$$
Policy Matrix (Hot / Warm / Cold):
  Table                         Class  Partition   Hot keep  Warm keep  Cold
  ---------------------------------------------------------------------------
  agent_check_ins               Fact   Daily       180 d     365 d      Per-day dumps
  agent_tasking_history         Fact   Daily       180 d     365 d      Per-day dumps
  dirwalks                      Fact   Daily       90 d      365 d      Per-day dumps
  endpoints                     Dim    No          Forever    N/A        Optional dumps (no delete)
  agent_core                    Dim    No          Forever    N/A        Optional dumps (no delete)
  users / engagements / tasking / agent_configuration / load_balancers (core dims):
                                 Dim   No          Forever    N/A        Optional dumps (no delete)

Design tenets:
  • Facts use pg_partman (daily) as HOT parents; old partitions are DETACHED and
    ATTACHED to *archive* parents (WARM) to remain queryable; much older archive
    partitions are dumped to cold storage and then dropped.
  • Dimensions stay live to preserve FK integrity and enable full-fidelity replay.
  • Replay = restore dumped partition table, set schema public, ATTACH to archive parent with original bounds.
$$;
