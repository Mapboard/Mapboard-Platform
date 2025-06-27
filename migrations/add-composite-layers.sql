alter table {data_schema}.map_layer
  add column "composited_from" integer[];
alter table {data_schema}.map_layer add column "editable" boolean default true;

alter table {topo_schema}.map_face add column "source_id" integer
  REFERENCES {topo_schema}.map_face (id) ON DELETE CASCADE;
alter table {topo_schema}.map_face add column "source_layer" integer
  REFERENCES {data_schema}.map_layer (id) ON DELETE CASCADE;

alter table {data_schema}.linework add column "source_id" integer
  REFERENCES {data_schema}.linework (id) ON DELETE CASCADE;
alter table {data_schema}.linework add column "source_layer" integer
  REFERENCES {data_schema}.map_layer (id) ON DELETE CASCADE;
alter table {data_schema}.linework add column "covered" boolean default false;
