/** We realized we needed to go back and add a topological key to the map tables,
  * particurly linework
 */

ALTER TABLE {data_schema}.linework_type
  ADD COLUMN topological boolean;

ALTER TABLE {data_schema}.polygon_type
  ADD COLUMN topological boolean;
