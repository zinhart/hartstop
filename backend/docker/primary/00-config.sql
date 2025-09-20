-- Ensure the primary is replication-ready from the first boot.
-- We use ALTER SYSTEM so settings persist in postgresql.auto.conf
-- The primary server configuration for streaming replication
ALTER SYSTEM SET listen_addresses = '*';
ALTER SYSTEM SET wal_level = 'replica';
ALTER SYSTEM SET max_wal_senders = '20';
ALTER SYSTEM SET max_replication_slots = '20';
ALTER SYSTEM SET hot_standby = 'on';
ALTER SYSTEM SET wal_compression = 'on';
ALTER SYSTEM SET shared_buffers = '512MB';
ALTER SYSTEM SET effective_cache_size = '1GB';

-- if using ssl uncomment the 4 lines below
-- ALTER SYSTEM SET ssl = 'on';
-- ALTER SYSTEM SET ssl_cert_file = '/var/lib/postgresql/certs/server.crt';
-- ALTER SYSTEM SET ssl_key_file  = '/var/lib/postgresql/certs/server.key';
-- ALTER SYSTEM SET ssl_ca_file  = '/var/lib/postgresql/certs/rootCA.crt'; -- if verify-full or mTLS

SELECT pg_reload_conf();
