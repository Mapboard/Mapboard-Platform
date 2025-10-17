import { useEffect, useMemo, useState } from "react";
import { StyleSpecification } from "mapbox-gl";
import { getMapboxStyle } from "@macrostrat/mapbox-utils";
import { mapboxToken } from "~/settings";
import {
  computeTiledBounds,
  prepareStyleForMaplibre,
  TiledMapArea,
} from "~/maplibre";
import { marked } from "marked";
import hyper from "@macrostrat/hyper";
import styles from "./legend.module.sass";

const h = hyper.styled(styles);

export function useSourcesStyle(baseURL: string) {
  const baseStyleURL = "mapbox://styles/jczaplewski/ckxcu9zmu4aln14mfg4monlv3";

  const [baseStyle, setBaseStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    if (baseStyleURL == null) return;
    getMapboxStyle(baseStyleURL, {
      access_token: mapboxToken,
    }).then((baseStyle) => {
      setBaseStyle(baseStyle);
    });
  }, [baseStyleURL]);

  return useMemo(() => {
    if (baseStyle == null) {
      return null;
    }
    let style = baseStyle;
    // Modernize the terrain source
    style.sources["mapbox://mapbox.terrain-rgb"].url =
      "mapbox://mapbox.mapbox-terrain-dem-v1";

    return {
      ...style,
      sources: {
        ...style.sources,
        map: {
          type: "vector",
          tiles: [
            baseURL + `/tile/fills,lines,polygons/{z}/{x}/{y}?map_layer=24`,
          ],
          volatile: false,
        },
      },
      layers: [
        ...style.layers,
        {
          id: "map-areas",
          type: "fill",
          source: "map",
          "source-layer": "fills",
          paint: {
            "fill-color": "#1e90ff",
            "fill-opacity": [
              "match",
              ["get", "type"],
              "domain-1",
              0.5,
              "domain-2",
              0.35,
              "domain-3",
              0.2,
              0.1,
            ],
          },
        },
        {
          id: "domain-labels",
          type: "symbol",
          source: "map",
          "source-layer": "polygons",
          layout: {
            "text-field": [
              "match",
              ["get", "type"],
              "domain-1",
              "1",
              "domain-2",
              "2",
              "domain-3",
              "3",
              "domain-4",
              "4",
              "domain-5",
              "5",
              "",
            ],
            "text-font": ["PT Serif Bold"],
            "text-size": 30,
            "text-allow-overlap": false,
            "symbol-placement": "point",
          },
          paint: {
            "text-halo-color": "rgba(255,255,255, 0.5)",
            "text-halo-width": 2,
            "text-halo-blur": 2,
            "text-color": "#092b4d",
          },
        },
        {
          id: "map-lines",
          type: "line",
          source: "map",
          "source-layer": "lines",
          paint: {
            "line-color": "#092b4d",
            "line-width": 2,
            "line-opacity": 0.8,
          },
        },
      ],
    };
  }, [baseStyle]);
}
export function SourcesMap({
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

  const style = useSourcesStyle(baseURL);

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
          h("li.domain", [
            h("h5", d.name),
            h(
              "ul",
              d.desc.map((line) => {
                const html = marked.parse(line);
                return h("li", { dangerouslySetInnerHTML: { __html: html } });
              }),
            ),
          ]),
        ),
      ),
    ]),
  ]);
}

const marientalSheet =
  "Geological map of Namibia: 1:250 000 geological series. Sheet 2316, Mariental, 1993";
const sourceDomains = [
  {
    name: "1",
    desc: [
      "Detailed mapping, 2015-2018 *(this study)*.",
      "Interpretation of satellite and uncrewed aerial vehicle (_UAV_) imagery and elevation models *(this study)*.",
    ],
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
      marientalSheet,
      "Omkyk Member subdivisions from reconnaissance mapping and satellite photo interpretation *(this study)*.",
      "Hoogland member associations based on *Dibenedetto and Grotzinger (2005)*.",
    ],
  },
  {
    name: "4",
    desc: [marientalSheet],
  },
  {
    name: "5",
    desc: [
      "Geological map of Namibia: 1:250 000 geological series. Sheet 2314, Meob Bay, 2000",
    ],
  },
];
