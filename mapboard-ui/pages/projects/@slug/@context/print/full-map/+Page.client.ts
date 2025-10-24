import hyper from "@macrostrat/hyper";
import { mapboxToken } from "~/settings";
import type { Data } from "../../+data";
import { useData } from "vike-react/useData";
import { MapStateProvider } from "../../state";
// Import other components
import styles from "./map.module.sass";
import { setupStyleImageManager } from "../../style/pattern-manager";
import { useRequestTransformer } from "../../transform-request";
import { useDisplayStyle } from "../../display/style";

import { useCallback } from "react";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { expandInnerSize } from "@macrostrat/ui-components";
import { computeTiledBoundsForMap, TiledMapArea } from "~/maplibre";
import { SourcesMap } from "./legend/sources-map";
import { PrintArea } from "~/utils/print-area";
import { Scalebar } from "~/map-scale";
import { LegendPanel } from "./legend";
import { useInitializeMap } from "./utils";

const h = hyper.styled(styles);

export function Page() {
  const ctx = useData<Data>();

  // Current domain + port if set is the base
  let domain = document.location.origin;
  const baseURL = `${domain}/api/project/${ctx.project_slug}/context/${ctx.slug}`;

  return h(PrintArea, { filename: "full-map.pdf" }, [
    h(
      MapStateProvider,
      { baseURL, baseLayers: ctx.layers, defaultLayer: 22, context: ctx },
      h(PageInner, { baseURL, context: ctx }),
    ),
  ]);
}

function PageInner({ baseURL, context: ctx }) {
  const tileBounds = computeTiledBoundsForMap(ctx.bounds, {
    metersPerPixel: 15,
    tileSize: 512,
  });
  const style = useDisplayStyle(baseURL, {
    mapboxToken,
    projectID: ctx.project_id,
    contextSlug: ctx.slug,
    crossSectionClipContext: "cross-section-aoi",
    showCrossSectionLabels: true,
  });

  const initializeMap = useInitializeMap();

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
        className: "map-area",
        tileBounds,
        style,
        initializeMap,
        ...sizeOpts,
      },
      [
        h(Scalebar, {
          className: "map-scalebar",
          scale: tileBounds.realMetersPerPixel,
          width: 1000,
          backgroundColor: "white",
        }),
      ],
    ),
    h("div.right-column", [
      h(LegendPanel),
      h("div.map-info", [
        h(SourcesMap, {
          baseURL,
          bounds: tileBounds.bounds,
          initializeMap,
        }),
      ]),
    ]),
  ]);
}
