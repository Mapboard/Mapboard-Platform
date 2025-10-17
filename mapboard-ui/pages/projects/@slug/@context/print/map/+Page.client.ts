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
import { computeTiledBounds, mercatorBBox, TiledMapArea } from "~/maplibre";
import { CrossSectionsList } from "../cross-sections/cross-section";
import { Scalebar } from "~/map-scale";
import { distance } from "@turf/distance";

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
  const metersPerPixel = 8;
  const lngLatBBox = bbox(ctx.bounds);
  const bounds = mercatorBBox(lngLatBBox);

  const tileBounds = computeTiledBounds(bounds, {
    metersPerPixel,
    tileSize: 512,
  });
  const transformRequest = useRequestTransformer(true);
  const style = useDisplayStyle(baseURL, {
    mapboxToken,
    projectID: ctx.project_id,
    contextSlug: ctx.slug,
    showCrossSectionLabels: false,
  });

  const initializeMap = useCallback(
    (opts: maplibre.MapOptions) => {
      const map = new maplibre.Map({
        ...opts,
        transformRequest,
        pixelRatio: 4,
      });
      setupStyleImageManager(map);
      return map;
    },
    [transformRequest],
  );

  if (style == null) return null;

  const sizeOpts = expandInnerSize({
    innerHeight: tileBounds.pixelSize.height,
    innerWidth: tileBounds.pixelSize.width,
    padding: 0,
  });

  // get real-world width of bounds from latitude
  const realMetersPerPixel =
    getWidthOfMapView(lngLatBBox) / tileBounds.pixelSize.width;

  return h("div.main", [
    h(
      TiledMapArea,
      { tileBounds, style, initializeMap, className: "map-area", ...sizeOpts },
      [
        h(Scalebar, {
          className: "map-scalebar",
          scale: realMetersPerPixel,
          width: 200,
          backgroundColor: "white",
        }),
      ],
    ),
    h.if(ctx.crossSections != null)(CrossSectionsList, {
      data: ctx.crossSections,
      elevationRange: [1000, 2100],
      metersPerPixel: realMetersPerPixel,
      className: "cross-sections",
    }),
  ]);
}

function getWidthOfMapView(bbox) {
  // Get the real-world width of the bbox in meters
  // Does not handle low-zoom cases as yet
  const nw = [bbox[0], bbox[3]];
  const ne = [bbox[2], bbox[3]];
  const sw = [bbox[0], bbox[1]];
  const se = [bbox[2], bbox[1]];
  const d0 = distance(nw, ne, { units: "meters" });
  const d1 = distance(sw, se, { units: "meters" });
  return (d0 + d1) / 2;
}
