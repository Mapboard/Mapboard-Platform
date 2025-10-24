import { useMemo } from "react";
import { apiBaseURL, mapboxToken } from "~/settings";
import {
  computeTiledBounds,
  computeTiledBoundsForMap,
  prepareStyleForMaplibre,
  TiledMapArea,
} from "~/maplibre";
import hyper from "@macrostrat/hyper";
import styles from "./+Page.client.module.sass";
import { useInsetMapStyle } from "../../style";
import maplibre from "maplibre-gl";
import { useMapboxRequestTransformer } from "../../transform-request";
import { mergeStyles } from "@macrostrat/mapbox-utils";
import { buildCrossSectionsStyle } from "../../display/style";

const h = hyper.styled(styles);

export function useCrossSectionsInsetStyle({ baseURL, projectID, clipSlug }) {
  const style = useInsetMapStyle();

  return useMemo(() => {
    if (style == null) {
      return null;
    }

    const crossSectionsStyle = buildCrossSectionsStyle({
      showLabels: true,
      baseURL,
      projectID,
      clipSlug,
    });

    return mergeStyles(style, crossSectionsStyle);
  }, [style]);
}

export function InsetMap({
  baseURL,
  projectID,
  bounds,
}: {
  bounds: any;
  initializeMap: any;
}) {
  const tileBounds = computeTiledBoundsForMap(bounds, {
    metersPerPixel: 150,
    tileSize: 512,
  });

  const transformRequest = useMapboxRequestTransformer();

  const style = useCrossSectionsInsetStyle({
    baseURL,
    projectID,
    clipSlug: "cross-section-aoi",
  });

  if (style == null) return null;

  return h(TiledMapArea, {
    tileBounds: tileBounds,
    style: prepareStyleForMaplibre(style, mapboxToken),
    initializeMap(opts: maplibre.MapOptions) {
      return new maplibre.Map({
        ...opts,
        transformRequest,
        pixelRatio: 4,
      });
    },
  });
}
