import { createUnitFill } from "./pattern-images";
import mapboxgl, { Map } from "mapbox-gl";

export interface PolygonPatternConfig {
  symbol?: string;
  id: string;
  color: string;
  symbolColor?: string;
}

interface StyleImageOptions {
  patternBaseURL: string;
}

export interface PolygonStyleIndex {
  [key: string]: string;
}

export async function setupStyleImages(
  map: Map,
  patterns: PolygonPatternConfig[],
  options: StyleImageOptions,
): Promise<PolygonStyleIndex> {
  const { patternBaseURL } = options;

  const res = await Promise.all(
    patterns.map(async function (type) {
      const { symbol, id } = type;
      const uid: string = id + "-fill";
      if (map.hasImage(uid)) return [id, uid];
      const url = symbol == null ? null : patternBaseURL + `/${symbol}.svg`;
      const img = await createUnitFill({
        patternURL: url,
        color: type.color,
        patternColor: type.symbolColor,
      });
      if (map.hasImage(uid)) return [id, uid];
      console.log("Adding image", uid);
      try {
        map.addImage(uid, img, { sdf: false, pixelRatio: 12 });
      } catch (err) {
        console.error("Error adding image", uid, err);
      }
      console.log("Added image", uid, type, img);
      return [id, uid];
    }),
  );

  return res.reduce((acc, [id, uid]) => {
    acc[id] = uid;
    return acc;
  }, {} as PolygonStyleIndex);
}
