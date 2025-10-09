import { useEffect, useMemo, useState } from "react";
import { StyleSpecification } from "mapbox-gl";
import { getMapboxStyle, mergeStyles } from "@macrostrat/mapbox-utils";
import { buildDisplayOverlayStyle } from "../style/overlay";
import { apiBaseURL } from "~/settings";
import { createStationsLayer } from "../style/station-layers";
import { useDEMTileURL } from "../transform-request";
import mlcontour from "maplibre-contour";
import maplibre from "maplibre-gl";

import type { MapStyleOptions } from "../style";

export function useDisplayStyle(
  baseURL: string,
  { mapboxToken, showOverlay = true, projectID }: MapStyleOptions,
) {
  const baseStyleURL = "mapbox://styles/jczaplewski/cmggy9lqq005l01ryhb5o2eo4";

  const [overlayStyle, setOverlayStyle] = useState(null);

  const [baseStyle, setBaseStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    if (baseStyleURL == null) return;
    getMapboxStyle(baseStyleURL, {
      access_token: mapboxToken,
    }).then((baseStyle) => {
      setBaseStyle(baseStyle);
    });
  }, [baseStyleURL]);

  useEffect(() => {
    if (!showOverlay) {
      setOverlayStyle(null);
      return;
    }

    const style = buildDisplayOverlayStyle(baseURL, {
      selectedLayer: 22, // composite layer
    });

    const stationsStyle: Partial<StyleSpecification> = {
      sources: {
        stations: {
          type: "geojson",
          data: `${apiBaseURL}/stations.geojson?project_id=eq.${projectID}`,
        },
      },
      layers: [
        createStationsLayer({
          id: "orientations",
          sourceID: "stations",
          showOrientations: true,
          showAll: false,
        }),
      ],
    };

    setOverlayStyle(mergeStyles(style, stationsStyle));
  }, [showOverlay]);

  const demURL = useDEMTileURL();

  const demSource = useMemo(() => {
    if (demURL == null) return null;
    const src = new mlcontour.DemSource({
      url: demURL,
      encoding: "mapbox", // "mapbox" or "terrarium" default="terrarium"
      maxzoom: 14,
      worker: true, // offload isoline computation to a web worker to reduce jank
      cacheSize: 50, // number of most-recent tiles to cache
      timeoutMs: 20_000, // timeout on fetch requests
    });
    src.setupMaplibre(maplibre);
    console.log(src);
    return src;
  }, [demURL]);

  return useMemo(() => {
    if (baseStyleURL == null || overlayStyle == null) {
      return null;
    }

    const mainStyle: mapboxgl.StyleSpecification = {
      version: 8,
      name: "Mapboard",
      glyphs: "mapbox://fonts/openmaptiles/{fontstack}/{range}.pbf",
      layers: [
        // We need to add this so that the style doesn't randomly reload
        {
          id: "sky",
          type: "sky",
          paint: {
            "sky-type": "atmosphere",
            "sky-atmosphere-sun": [0.0, 0.0],
            "sky-atmosphere-sun-intensity": 15,
          },
        },
      ],
      sources: {
        terrain: {
          type: "raster-dem",
          url: demURL,
          tileSize: 512,
          maxzoom: 14,
        },
      },
    };

    let contourStyle = null;
    if (demSource != null) {
      contourStyle = {
        sources: {
          contour: {
            type: "vector",
            tiles: [
              demSource.contourProtocolUrl({
                thresholds: {
                  10: 20,
                  12: 10,
                },
                contourLayer: "contours",
                elevationKey: "ele",
                levelKey: "level",
                extent: 4096,
                buffer: 1,
              }),
            ],
            maxzoom: 14,
          },
          terrain: {
            type: "raster-dem",
            url: demSource.sharedDemProtocolUrl,
            tileSize: 256,
            maxzoom: 14,
          },
        },
        layers: [
          {
            id: "contour-lines",
            type: "line",
            source: "contour",
            "source-layer": "contours",
            paint: {
              "line-color": "#777",
              // level = highest index in thresholds array the elevation is a multiple of
              "line-width": 0.25, //["match", ["get", "level"], 1, 1, 0.5],
            },
          },
          {
            id: "contour-labels",
            type: "symbol",
            source: "contour",
            "source-layer": "contours",
            filter: [">", ["get", "level"], 0],
            layout: {
              "symbol-placement": "line",
              "text-size": 10,
              "text-field": [
                "concat",
                ["number-format", ["get", "ele"], {}],
                "'",
              ],
              "text-font": ["Noto Sans Bold"],
            },
            paint: {
              "text-halo-color": "white",
              "text-halo-width": 1,
            },
          },
        ],
      };
    }

    let style = mergeStyles(baseStyle, mainStyle, contourStyle, overlayStyle);

    for (const [key, source] of Object.entries(style.sources)) {
      if (
        source.type === "raster-dem" &&
        source.url != demSource.sharedDemProtocolURL
      ) {
        delete style.sources[key];
      }
    }

    const oldRasterID = "mapbox://mapbox.terrain-rgb";
    delete style.sources[oldRasterID];
    style.layers = style.layers
      .filter((d) => {
        return d.type != "hillshade";
      })
      .map((l) => {
        if (l.source === oldRasterID) {
          return {
            ...l,
            source: "terrain",
          };
        }
        return l;
      });

    delete style.terrain;
    delete style.projection;

    // Deleting glyphs property means we try to use local fonts
    //delete style.glyphs;

    console.log("Setting style", style);
    return style;
  }, [baseStyle, overlayStyle, demSource]);
}
