import hyper from "@macrostrat/hyper";
import { mapboxToken } from "~/settings";
import type { Data } from "../../+data";
import { useData } from "vike-react/useData";
import { MapStateProvider } from "../../state";
// Import other components
import { bbox } from "@turf/bbox";
import styles from "./map.module.scss";
import { setupStyleImageManager } from "../../style/pattern-manager";
import { useRequestTransformer } from "../../transform-request";
import { useDisplayStyle } from "../../display/style";

import { useCallback } from "react";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { expandInnerSize } from "@macrostrat/ui-components";
import { prepareStyleForMaplibre } from "~/maplibre/utils";
import { computeTiledBounds, mercatorBBox, TiledMapArea } from "~/maplibre";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  // Current domain + port if set is the base
  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(
    MapStateProvider,
    { baseURL, baseLayers: ctx.layers, defaultLayer: 22, context: ctx },
    h(PageInner, { baseURL, context: ctx }),
  );
}

function PageInner({ baseURL, context: ctx }) {
  const bounds = mercatorBBox(bbox(ctx.bounds));

  const tileBounds = computeTiledBounds(bounds, {
    metersPerPixel: 50,
    tileSize: 512,
  });
  const transformRequest = useRequestTransformer(true);
  const style = useDisplayStyle(baseURL, {
    mapboxToken,
    isMapView: false,
    projectID: ctx.project_id,
  });

  const initializeMap = useCallback(
    (opts: maplibre.MapOptions) => {
      const map = new maplibre.Map({
        ...opts,
        transformRequest,
      });
      setupStyleImageManager(map);
      return map;
    },
    [transformRequest],
  );

  if (style == null) return null;

  const style1 = prepareStyleForMaplibre(style, mapboxToken);

  const sizeOpts = expandInnerSize({
    innerHeight: tileBounds.pixelSize.height,
    innerWidth: tileBounds.pixelSize.width,
    padding: 40,
    paddingLeft: 60,
  });

  return h("div.main", [
    h(TiledMapArea, { tileBounds, style: style1, initializeMap, ...sizeOpts }),
  ]);
}
