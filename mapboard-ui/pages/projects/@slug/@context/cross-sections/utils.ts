import type * as GeoJSON from "geojson";

export function unwrapMultiLineString(
  geom: GeoJSON.LineString | GeoJSON.MultiLineString,
) {
  if (geom.type === "LineString") {
    return geom;
  } else if (geom.type === "MultiLineString") {
    // Just take the first linestring
    return {
      type: "LineString",
      coordinates: geom.coordinates[0],
    };
  } else {
    throw new Error("Geometry must be LineString or MultiLineString");
  }
}
