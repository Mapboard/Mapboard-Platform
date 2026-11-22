/** Accounts and per-project access.

  A user is identified by an ORCID iD (`sub`). Each project is public or private
  for reading; editing always needs a grant. Access levels are ordered, so a
  check is a comparison: `mapboard.project_access(...) >= 'edit'`.
 */

ALTER TABLE users ADD COLUMN IF NOT EXISTS sub text UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

ALTER TABLE mapboard.project ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'mapboard' AND t.typname = 'access_level') THEN
    CREATE TYPE mapboard.access_level AS enum ('read', 'edit', 'admin');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mapboard.project_member (
  project_id integer NOT NULL REFERENCES mapboard.project (id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  access     mapboard.access_level NOT NULL DEFAULT 'read',
  created_at timestamp DEFAULT current_timestamp,
  PRIMARY KEY (project_id, user_id)
);

-- The account behind the current PostgREST request, from its JWT `sub` claim.
CREATE OR REPLACE FUNCTION mapboard.current_user_id()
  RETURNS integer AS
$$
SELECT id
FROM public.users
WHERE sub = nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- A user's access to a project; NULL means none. `_user_id` NULL is an anonymous visitor.
CREATE OR REPLACE FUNCTION mapboard.project_access(_project_id integer, _user_id integer)
  RETURNS mapboard.access_level AS
$$
SELECT CASE
  WHEN u.is_admin OR p.owner_id = u.id THEN 'admin'::mapboard.access_level
  WHEN m.access IS NOT NULL THEN m.access
  WHEN p.is_public THEN 'read'::mapboard.access_level
END
FROM mapboard.project p
LEFT JOIN public.users u ON u.id = _user_id
LEFT JOIN mapboard.project_member m ON m.project_id = p.id AND m.user_id = u.id
WHERE p.id = _project_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
