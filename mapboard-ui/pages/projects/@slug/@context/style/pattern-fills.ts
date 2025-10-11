import { createTransparentImage, createUnitFill } from "./pattern-images";
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
  const { patternBaseURL, pixelRatio = 16 } = options;

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

      try {
        map.addImage(uid, img, { sdf: false, pixelRatio });
      } catch (err) {
        console.error("Error adding image", uid, err);
      }
      return [id, uid];
    }),
  );

  // Add transparent image
  const transparent = "transparent";
  if (!map.hasImage(transparent)) {
    const img = createTransparentImage();
    map.addImage(transparent, img, { sdf: false, pixelRatio });
    res.push([transparent, transparent]);
  }

  return res.reduce((acc, [id, uid]) => {
    acc[id] = uid;
    return acc;
  }, {} as PolygonStyleIndex);
}
