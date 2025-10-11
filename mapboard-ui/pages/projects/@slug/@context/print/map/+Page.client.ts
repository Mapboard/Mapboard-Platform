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
import { useDisplayStyle, useSourcesStyle } from "../../display/style";

import { useCallback } from "react";
import maplibre from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { expandInnerSize } from "@macrostrat/ui-components";
import { prepareStyleForMaplibre } from "~/maplibre/utils";
import { computeTiledBounds, mercatorBBox, TiledMapArea } from "~/maplibre";
import { marked } from "marked";
//import { LegendPanel } from "./legend";

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
    //h(TiledMapArea, { tileBounds, style: style1, initializeMap, ...sizeOpts }),

    h(LegendPanel),
    h("div.map-info", [
      h(SourcesMap, {
        baseURL,
        bounds,
        initializeMap,
      }),
    ]),
  ]);
}

function SourcesMap({
  baseURL,
  bounds,
  initializeMap,
}: {
  bounds: any;
  initializeMap: any;
}) {
  const tileBounds = computeTiledBounds(bounds, {
    metersPerPixel: 150,
    tileSize: 512,
  });

  const style = useSourcesStyle(baseURL, {
    mapboxToken,
  });

  if (style == null) return null;

  return h("div.map-credits", [
    h(TiledMapArea, {
      tileBounds: tileBounds,
      style: prepareStyleForMaplibre(style, mapboxToken),
      initializeMap,
    }),
    h("div.source-list", [
      h("h4", "Mapping domains"),
      h(
        "ul.domains",
        sourceDomains.map((d) =>
          h("li", [
            h("strong", d.name),
            h(
              "ul",
              d.desc.map((line) => {
                const html = marked.parse(line);
                console.log(html);
                return h("li", { dangerouslySetInnerHTML: { __html: html } });
              }),
            ),
          ]),
        ),
      ),
    ]),
  ]);
}

const rehobothQuad =
  "Geological map of Namibia: 1:250 000 geological series. Sheet 2316, Rehoboth, 2006";

const sourceDomains = [
  {
    name: "1",
    desc: ["Detailed mapping, 2015-2018 *(this study)*."],
  },
  {
    name: "2",
    desc: [
      "Hartnady, C.J.H., 1980. *Geological map of the Naukluft area*, Precambrian Research Unit, University of Cape Town",
      "Revised unit associations from reconnaissance mapping *(this study)*.",
    ],
  },
  {
    name: "3",
    desc: [
      rehobothQuad,
      "Omkyk Member subdivisions from reconnaissance mapping and aerial photo interpretation *(this study)*.",
      "Hoogland member associations based on *Dibenedetto and Grotzinger (2005)*.",
    ],
  },
  {
    name: "4",
    desc: [rehobothQuad],
  },
];
