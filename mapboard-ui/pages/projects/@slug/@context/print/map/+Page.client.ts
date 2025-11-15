import hyper from "@macrostrat/hyper";
import { mapboxToken } from "~/settings";
import type { Data } from "../../+data";
import { useData } from "vike-react/useData";
import { MapStateProvider } from "../../state";
// Import other components
import styles from "./map.module.scss";
import { setupStyleImageManager } from "../../style/pattern-manager";
import { useRequestTransformer } from "../../transform-request";
import { useDisplayStyle } from "../../display/style";

import { useCallback } from "react";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { expandInnerSize } from "@macrostrat/ui-components";
import { computeTiledBoundsForMap, TiledMapArea } from "~/maplibre";
import { CrossSectionsList } from "../cross-sections/cross-section";
import { Scalebar } from "~/map-scale";
import { PrintArea } from "~/utils/print-area";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  // Current domain + port if set is the base
  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  const filename = `${ctx.project_slug}-${ctx.slug}-map.pdf`;

  return h(
    PrintArea,
    { filename },
    h(
      MapStateProvider,
      { baseURL, baseLayers: ctx.layers, defaultLayer: 22, context: ctx },
      h(PageInner, { baseURL, context: ctx }),
    ),
  );
}

function PageInner({ baseURL, context: ctx }) {
  const metersPerPixel = 8;

  const tileBounds = computeTiledBoundsForMap(ctx.bounds, {
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

  return h("div.main", [
    h(
      TiledMapArea,
      { tileBounds, style, initializeMap, className: "map-area", ...sizeOpts },
      [
        h(Scalebar, {
          className: "map-scalebar",
          scale: tileBounds.realMetersPerPixel,
          width: 200,
          labelPosition: "top",
        }),
      ],
    ),
    h.if(ctx.crossSections != null)(CrossSectionsList, {
      data: ctx.crossSections,
      elevationRange: [1000, 2100],
      metersPerPixel: tileBounds.realMetersPerPixel,
      className: "cross-sections",
    }),
  ]);
}
