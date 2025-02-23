import { createUnitFill } from "./pattern-images";
import { Map } from "mapbox-gl";

interface PolygonPatternConfig {
  symbol: string;
  id: string;
  color: string;
  symbolColor: string;
}

interface StyleImageOptions {
  patternBaseURL: string;
}

async function setupStyleImages(
  map: Map,
  patterns: PolygonPatternConfig[],
  options: StyleImageOptions,
) {
  const { patternBaseURL } = options;

  return Promise.all(
    patterns.map(async function (type: any) {
      const { symbol, id } = type;
      const uid = id + "_fill";
      if (map.hasImage(uid)) return;
      const url = symbol == null ? null : patternBaseURL + `/${symbol}.png`;
      const img = await createUnitFill({
        patternURL: url,
        color: type.color,
        patternColor: type.symbol_color,
      });
      if (map.hasImage(uid)) return;
      map.addImage(uid, img, { sdf: false, pixelRatio: 12 });
    }),
  );
}
