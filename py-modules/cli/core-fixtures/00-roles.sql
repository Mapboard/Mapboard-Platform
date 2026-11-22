-- PostgREST's request roles. Cluster-wide, and shared with Macrostrat on the dev cluster.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_user') THEN
    CREATE ROLE web_user NOLOGIN;
  END IF;
END $$;
