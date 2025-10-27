import { useMemo } from "react";
import { computeTiledBoundsForMap, TiledMapArea } from "~/maplibre";
import hyper from "@macrostrat/hyper";
import styles from "./+Page.client.module.sass";
import { useInsetMapStyle } from "../../style";
import maplibre from "maplibre-gl";
import { useMapboxRequestTransformer } from "../../transform-request";
import { mergeStyles } from "@macrostrat/mapbox-utils";
import { buildCrossSectionsStyle } from "../../display/style";
import { Scalebar } from "~/map-scale";

const h = hyper.styled(styles);

export function useCrossSectionsInsetStyle({ baseURL, projectID, clipSlug }) {
  const style = useInsetMapStyle();

  return useMemo(() => {
    if (style == null) {
      return null;
    }

    const crossSectionsStyle = buildCrossSectionsStyle({
      showLabels: true,
      baseURL: "/pg-api",
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
  className,
}: {
  bounds: any;
  initializeMap: any;
}) {
  const tileBounds = computeTiledBoundsForMap(bounds, {
    metersPerPixel: 120,
    tileSize: 512,
    padding: 20,
  });

  const transformRequest = useMapboxRequestTransformer();

  const style = useCrossSectionsInsetStyle({
    baseURL,
    projectID,
    clipSlug: "cross-section-aoi",
  });

  if (style == null) return null;

  return h(
    "div.inset-map",
    { className },
    h(
      TiledMapArea,
      {
        tileBounds: tileBounds,
        style,
        initializeMap(opts: maplibre.MapOptions) {
          return new maplibre.Map({
            ...opts,
            transformRequest,
            pixelRatio: 8,
          });
        },
      },
      h(Scalebar, {
        className: "map-scalebar",
        scale: tileBounds.realMetersPerPixel,
        width: 100,
      }),
    ),
  );
}
