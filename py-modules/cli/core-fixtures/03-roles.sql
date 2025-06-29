-- copied straight from the Postgrest config
CREATE ROLE web_auth LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOSUPERUSER;
-- CREATE ROLE anonymous NOLOGIN;
CREATE ROLE web_anon NOLOGIN;
CREATE ROLE web_user NOLOGIN;

-- Postgrest is our 'authenticator' role
GRANT web_anon TO web_auth;
GRANT web_user TO web_auth;

GRANT USAGE ON SCHEMA mapboard_api TO web_anon;
GRANT USAGE ON SCHEMA mapboard_api TO web_user;
GRANT SELECT ON ALL TABLES IN SCHEMA mapboard_api TO web_anon;
GRANT SELECT ON ALL TABLES IN SCHEMA mapboard_api TO web_user;

NOTIFY pgrst, 'reload schema';
