/** One-time setup of the `mapboard` database on a shared Postgres cluster.
  *
  * Run as a superuser of the cluster (`postgres`, or its admin user), connected to the
  * `mapboard` database,
  * before restoring into it. It lets the database's owner role (`mapboard`) run
  * Mapboard without being a superuser itself:
  *
  * - Creates the extensions that only a superuser may create. The
  *   `CREATE EXTENSION IF NOT EXISTS` statements in the fixtures then do nothing.
  * - Grants writes on PostGIS topology's bookkeeping tables, which belong to the
  *   extension's creator. CreateTopology, AddTopoGeometryColumn and DropTopology
  *   write to them.
  * - Grants the right to set `session_replication_role`, used by the topology
  *   manager's `reset-topology.sql` (Postgres 15+).
  *
  * PostgREST: the login role (`mapboard-postgrest` on the Macrostrat dev cluster)
  * switches into `web_anon` / `web_user`, which the cluster shares with Macrostrat.
  * Grant that after the restore, once the role exists:
  *
  *   GRANT web_anon, web_user TO "mapboard-postgrest";
  *
  * Restore as the owner, serially (with -j, topology.layer can load before
  * topology.topology and fail its foreign key), leaving out the entries this script
  * has already created or that belong to the extensions: the extensions themselves,
  * the `topology` schema, and PostGIS's `spatial_ref_sys` rows (empty unless a
  * project added custom SRIDs). Foreign servers are left behind too.
  *
  *   pg_restore -l mapboard.dump \
  *     | grep -v -E ' EXTENSION | SCHEMA - topology | SCHEMA topology |TABLE DATA public spatial_ref_sys| SERVER - ' \
  *     > restore.list
  *   pg_restore -d mapboard --no-owner --role=mapboard -L restore.list mapboard.dump
 **/

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

GRANT USAGE ON SCHEMA topology TO mapboard;
GRANT SELECT, INSERT, UPDATE, DELETE ON topology.topology, topology.layer TO mapboard;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE topology.topology_id_seq TO mapboard;

GRANT SET ON PARAMETER session_replication_role TO mapboard;

-- `mapboard.project` and `mapboard.canvas` have foreign keys to PostGIS's table of
-- spatial reference systems.
GRANT REFERENCES ON public.spatial_ref_sys TO mapboard;

-- A few objects live in `public` (`users`, `photo_note`, `context_type`). From
-- Postgres 15, only the database owner can create there, and the operator makes the
-- cluster's admin user the owner.
GRANT CREATE ON SCHEMA public TO mapboard;
