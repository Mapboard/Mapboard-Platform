import hyper from "@macrostrat/hyper";
import { mapboxToken } from "~/settings";
import type { Data } from "../../+data";
import { useData } from "vike-react/useData";
import { MapStateProvider } from "../../state";
// Import other components
import styles from "./map.module.scss";
import { setupStyleImageManager } from "../../style/pattern-manager";
import { useRequestTransformer } from "../../transform-request";
import { useBasicDisplayStyle } from "../../display/style";

import { useCallback } from "react";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { expandInnerSize } from "@macrostrat/ui-components";
import { computeTiledBoundsForMap, TiledMapArea } from "~/maplibre";
import { Scalebar } from "~/map-scale";
import { PrintArea } from "~/utils/print-area";
import { LegendPanel, OverviewLegendList } from "../full-map/legend";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  // Current domain + port if set is the base
  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(PrintArea, { filename: "overview-map.pdf" }, [
    h(
      MapStateProvider,
      { baseURL, baseLayers: ctx.layers, defaultLayer: 22, context: ctx },
      h(PageInner, { baseURL, context: ctx }),
    ),
  ]);
}

const bounds = [16, -24.42, 16.28, -24.18];

function PageInner({ baseURL, context: ctx }) {
  const metersPerPixel = 40;

  const tileBounds = computeTiledBoundsForMap(bounds, {
    metersPerPixel,
    tileSize: 512,
  });
  const transformRequest = useRequestTransformer(true);
  const style = useBasicDisplayStyle(baseURL, {
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
        pixelRatio: 8,
      });
      setupStyleImageManager(map, 6);
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

  return h("div.main", [
    h(
      TiledMapArea,
      {
        tileBounds,
        style,
        initializeMap,
        className: "map-area",
        ...sizeOpts,
        //internalScaleFactor: 2,
      },
      [],
    ),
    h("div.legend-sidebar", [
      h(OverviewLegendList),
      h(Scalebar, {
        className: "map-scalebar",
        scale: tileBounds.realMetersPerPixel,
        width: 150,
        labelPosition: "top",
      }),
    ]),
  ]);
}
