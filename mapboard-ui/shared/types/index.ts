export * from "./project-api";
import GeoJSON from "geojson";

import { definitions } from "./project-api";

type BaseContext = definitions["context"];

export interface Context extends Omit<BaseContext, "bounds" | "parent_geom"> {
  bounds: GeoJSON.Geometry;
  parent_geom: GeoJSON.Geometry;
}
