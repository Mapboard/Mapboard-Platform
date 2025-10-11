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

    const crossSectionsStyle = {
      sources: {
        crossSections: {
          type: "geojson",
          data: `${apiBaseURL}/cross_sections.geojson?project_id=eq.${projectID}&order=name.asc&is_public=eq.true&clip_context_slug=eq.cross-section-aoi`,
        },
        crossSectionEndpoints: {
          type: "geojson",
          data: `${apiBaseURL}/cross_section_endpoints.geojson?project_id=eq.${projectID}&is_public=eq.true&clip_context_slug=eq.cross-section-aoi`,
        },
      },
      layers: [
        {
          id: "cross-section-lines",
          type: "line",
          source: "crossSections",
          paint: {
            "line-color": "#444",
            "line-width": 2,
            "line-opacity": 1,
          },
        },
        {
          id: "cross-section-endpoints",
          type: "circle",
          source: "crossSectionEndpoints",
          paint: {
            "circle-color": "#444",
            "circle-radius": 3,
            "circle-opacity": 1,
          },
        },
        {
          id: "cross-section-start-labels",
          type: "symbol",
          source: "crossSectionEndpoints",
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["PT Sans Bold"],
            "text-size": 16,
            "text-radial-offset": 0.5,
            "text-allow-overlap": false,
            "text-variable-anchor": ["right", "top", "bottom", "left"],
          },
          paint: {
            "text-halo-color": "rgba(255,255,255, 0.5)",
            "text-halo-width": 1,
            "text-color": "#444",
          },
          filter: ["==", ["get", "end_type"], "start"],
        },
        {
          id: "cross-section-end-labels",
          type: "symbol",
          source: "crossSectionEndpoints",
          layout: {
            "text-field": ["concat", ["get", "name"], "'"],
            "text-font": ["PT Sans Bold"],
            "text-size": 16,
            "text-radial-offset": 0.5,
            "text-allow-overlap": false,
            "text-variable-anchor": ["left", "bottom", "top", "right"],
          },
          paint: {
            "text-halo-color": "rgba(255,255,255, 0.5)",
            "text-halo-width": 1,
            "text-color": "#444",
          },
          filter: ["==", ["get", "end_type"], "end"],
        },
      ],
    };

    let style = mergeStyles(
      baseStyle,
      mainStyle,
      contourStyle,
      overlayStyle,
      crossSectionsStyle,
    );

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
      // .filter((d) => {
      //   return d.type != "hillshade";
      // })
      .map((l) => {
        if (l.source === "mapbox-dem" || l.source === oldRasterID) {
          return {
            ...l,
            source: "terrain",
          };
        }
        return l;
      });

    delete style.terrain;

    // Deleting glyphs property means we try to use local fonts
    //delete style.glyphs;

    return style;
  }, [baseStyle, overlayStyle, demSource]);
}

export function useSourcesStyle(
  baseURL: string,
  { mapboxToken, showOverlay = true }: MapStyleOptions,
) {
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
              /* other */ "4",
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
