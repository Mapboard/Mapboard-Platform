/** Drop the foreign servers left behind by `mapboard db migrate-projects`.
  *
  * The per-project migration creates one `fs_<n>_<database>` postgres_fdw server per
  * source database and never removes it. Their user mappings store passwords, which
  * then go into every dump of the `mapboard` database.
 **/

DO $$
DECLARE
  srv text;
BEGIN
  FOR srv IN
    SELECT srvname FROM pg_foreign_server
    WHERE srvname ~ '^fs_[0-9]+_'
  LOOP
    EXECUTE format('DROP SERVER %I CASCADE', srv);
  END LOOP;
END $$;
