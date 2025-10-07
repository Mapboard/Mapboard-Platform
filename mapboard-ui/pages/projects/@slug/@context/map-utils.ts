import { SphericalMercator } from "@mapbox/sphericalmercator";
import {
  Feature,
  FeatureCollection,
  Geometry,
  GeometryCollection,
  BBox,
} from "geojson";
import { bbox } from "@turf/bbox";

const mercator = new SphericalMercator({
  size: 256,
  antimeridian: true,
});

export interface ExpandBoundsOptions {
  aspectRatio?: number;
  margin?: number;
}

export function expandBounds(
  input:
    | BBox
    | Feature
    | FeatureCollection
    | Geometry
    | GeometryCollection
    | null,
  options?: ExpandBoundsOptions,
) {
  if (input == null) {
    return null;
  }
  let bounds: BBox;
  if (Array.isArray(input)) {
    bounds = input;
  } else {
    bounds = bbox(input);
  }

  const aspectRatio = options?.aspectRatio;
  const margin = options?.margin ?? 0.1;

  const webMercatorBBox = mercator.convert(bounds, "900913");
  const [minX, minY, maxX, maxY] = webMercatorBBox;

  const center = [(minX + maxX) / 2, (minY + maxY) / 2];
  let dx = maxX - minX;
  let dy = maxY - minY;
  const m = (Math.max(dx, dy) * margin) / 2;

  dx += m;
  dy += m;

  let bbox2: BBox;
  if (aspectRatio != null) {
    if (dx > dy) {
      dy = dx / aspectRatio;
    } else {
      dx = dy * aspectRatio;
    }
  }

  bbox2 = [
    center[0] - dx / 2,
    center[1] - dy / 2,
    center[0] + dx / 2,
    center[1] + dy / 2,
  ];
  return mercator.convert(bbox2, "WGS84");
}
