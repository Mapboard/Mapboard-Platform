-- PostgREST's login role on the local stack; deployments name their own.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_auth') THEN
    CREATE ROLE web_auth LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;
END $$;

GRANT web_anon TO web_auth;
GRANT web_user TO web_auth;
