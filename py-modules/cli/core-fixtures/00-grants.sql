/** What `mapboard` needs from a superuser to own and run Mapboard without being one.
  *
  * Applied as the connecting role. On a new cluster, run
  * `mapboard --env <env> schema provision --target grants` before restoring a dump.
  * Restore as the owner, serially (with -j, topology.layer can load before
  * topology.topology and fail its foreign key), leaving out what the extensions own:
  *
  *   pg_restore -l mapboard.dump \
  *     | grep -v -E ' EXTENSION | SCHEMA - topology | SCHEMA topology |TABLE DATA public spatial_ref_sys| SERVER - ' \
  *     > restore.list
  *   pg_restore -d mapboard --no-owner --role=mapboard -L restore.list mapboard.dump
  *
  * PostgREST's login role (`mapboard-postgrest` on the dev cluster) switches into
  * `web_anon` / `web_user`; grant those to it once it exists.
 **/

-- Project schemas are created as `mapboard`.
DO $$
BEGIN
  EXECUTE format('GRANT ALL ON DATABASE %I TO mapboard', current_database());
END $$;

-- PostGIS topology's bookkeeping tables belong to the extension's creator.
-- CreateTopology, AddTopoGeometryColumn and DropTopology write to them.
GRANT USAGE ON SCHEMA topology TO mapboard;
GRANT SELECT, INSERT, UPDATE, DELETE ON topology.topology, topology.layer TO mapboard;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE topology.topology_id_seq TO mapboard;

-- The topology manager's `reset-topology.sql` sets it (Postgres 15+).
GRANT SET ON PARAMETER session_replication_role TO mapboard;

-- `mapboard.project` and `mapboard.canvas` have foreign keys to it.
GRANT REFERENCES ON public.spatial_ref_sys TO mapboard;

-- A few objects live in `public`. From Postgres 15 only the database owner creates
-- there, and the operator makes the cluster's admin user the owner.
GRANT CREATE ON SCHEMA public TO mapboard;
