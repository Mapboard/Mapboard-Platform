CREATE SCHEMA IF NOT EXISTS mapboard_api;

CREATE OR REPLACE VIEW mapboard_api.users AS
SELECT * FROM users;

CREATE OR REPLACE VIEW mapboard_api.projects AS
SELECT * FROM projects;

-- Reload schema cache
NOTIFY pgrst, 'reload_schema';