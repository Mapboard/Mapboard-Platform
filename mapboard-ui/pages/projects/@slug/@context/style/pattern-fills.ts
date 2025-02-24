import { createUnitFill } from "./pattern-images";
import { Map } from "mapbox-gl";

export interface PolygonPatternConfig {
  symbol: string;
  id: string;
  color: string;
  symbolColor?: string;
}

interface StyleImageOptions {
  patternBaseURL: string;
}

export async function setupStyleImages(
  map: Map,
  patterns: PolygonPatternConfig[],
  options: StyleImageOptions,
) {
  const { patternBaseURL } = options;

  return Promise.all(
    patterns.map(async function (type) {
      const { symbol, id } = type;
      const uid = id + "-fill";
      if (map.hasImage(uid)) return;
      const url = symbol == null ? null : patternBaseURL + `/${symbol}.svg`;
      const img = await createUnitFill({
        patternURL: url,
        color: type.color,
        patternColor: type.symbolColor,
      });
      console.log("Adding image", uid);
      if (map.hasImage(uid)) return;
      map.addImage(uid, img, { sdf: false, pixelRatio: 12 });
    }),
  );
}
