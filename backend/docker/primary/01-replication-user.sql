-- Replication user (used by the replicas for pg_basebackup + streaming)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'replicator') THEN
    CREATE ROLE replicator WITH REPLICATION LOGIN PASSWORD 'replicatorpass';
  END IF;
END$$;
