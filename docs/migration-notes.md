# Multi-tenant migration — field notes & known issues

Running log of issues observed while migrating real projects into the merged
`mapboard` database and standing applications back up on top of them. For the
migration mechanism itself see [`architecture.md`](./architecture.md#the-migration-mechanism-mapboard-db-migrate-projects).

## Stale schema references inside migrated functions/views (`map_digitizer` / `map_topology`)

**Observed:** 2026-10-02, project *naukluft* (`mb_naukluft_2517c1e5_*`), while
bringing `naukluft-app` up against the migrated schemas.

**Summary.** `migrate-projects` renames each source schema one-to-one and
correctly remaps **table** references (these bind by OID, so a schema rename
follows them). It does **not** rewrite schema names embedded as *text* in the
bodies of **SQL functions** (and some view expressions). Such bodies keep their
original bare-schema references — e.g. `FROM mapping.unit_tree` — which no longer
resolve once `mapping` has become `mb_<slug>_<uuid8>_mapping`, and fail at call
time with `relation "mapping.unit_tree" does not exist`.

This is the function/procedure analogue of the view/matview caveat already noted
in [the migration mechanism](./architecture.md#the-migration-mechanism-mapboard-db-migrate-projects)
(step 4).

**Partially addressed.** A migration re-run rewrote most affected functions: the
8 `section.*` functions and 4 of the `mapping.*` functions now point at the new
schema names. What the rewrite still **misses** is references to the **canvas**
schemas, i.e. the `map_digitizer` → `map_data` and `map_topology` → `map_topo`
renames (the data/topo schemas take the canvas *slug* as discriminator, not the
source schema name, so a name-based rewrite keyed on the auxiliary scheme skips
them).

**Still broken in naukluft** (5 functions, all editing/topology operations):

| Function | Unresolved bare references |
|---|---|
| `map_data.get_location_info` | `map_digitizer.*`, `map_topology.*` |
| `mapping.move_unit_bounds_to_layer` | `map_digitizer.*`, `map_topology.*`, `mapping.subunits` |
| `mapping.update_contacts` | `mapping.contact`, `mapping.linework`, `map_topology.topologize` |
| `mapping.insert_generalized` | `mapping.generalized_face` |
| `mapping.trigger_refresh_map_face` | `mapping.map_face` |

**Impact — low for now.** These are **archaic/outmoded editing & topology
operations**; they are not on `naukluft-app`'s read/write query surface (all 39 of
its queries validate against the migrated DB). They would only bite the Mapboard
editing API / topology-rebuild path. Deferred by decision — recorded here rather
than patched.

**If/when they need fixing.** Two options:
- *One-off:* `CREATE OR REPLACE` each function with its bare schema references
  rewritten to the `mb_<slug>_<uuid8>_{map_data,map_topo,mapping}` names.
- *Reproducible (preferred):* extend the migration's body-rewriting pass to also
  rename the **canvas** data/topo schemas inside function and view bodies, not
  only the auxiliary schemas — so editing-layer objects come across intact for
  every project.

### Detection query
Find migrated routines whose bodies still reference a pre-migration bare schema:

```sql
SELECT n.nspname || '.' || p.proname AS fn,
       (SELECT string_agg(DISTINCT m[1], ', ')
          FROM regexp_matches(
                 pg_get_functiondef(p.oid),
                 '[^_a-z]((mapping|section|carbon_isotopes|map_digitizer|map_topology)\.[a-z_]+)',
                 'g') AS m) AS bare_refs
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname LIKE 'mb_<slug>_<uuid8>%'
  AND p.prokind = 'f'
  AND pg_get_functiondef(p.oid) ~ '[^_a-z](mapping|section|carbon_isotopes|map_digitizer|map_topology)\.'
ORDER BY 1;
```
