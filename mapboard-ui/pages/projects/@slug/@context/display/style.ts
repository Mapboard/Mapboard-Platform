import { useEffect, useMemo, useState } from "react";
import { StyleSpecification } from "mapbox-gl";
import { getMapboxStyle, mergeStyles } from "@macrostrat/mapbox-utils";
import { buildDisplayOverlayStyle } from "../style/overlay";
import { apiBaseURL } from "~/settings";
import { createStationsLayer } from "../style/station-layers";
import { useDEMTileURL } from "../transform-request";
import mlcontour from "maplibre-contour";
import maplibre from "maplibre-gl";
import { prepareStyleForMaplibre } from "~/maplibre";

interface DisplayStyleOptions {
  mapboxToken: string;
  showOverlay?: boolean;
  projectID: number;
  contextSlug: string;
  showCrossSectionLabels?: boolean;
  // Context slug to clip by for viewing a subset of the cross section
  crossSectionClipContext?: string;
  showContours?: boolean;
}

export function useDisplayStyle(
  baseURL: string,
  {
    mapboxToken,
    showOverlay = true,
    showCrossSectionLabels = true,
    projectID,
    contextSlug,
    crossSectionClipContext,
    showContours = true,
  }: DisplayStyleOptions,
) {
  const baseStyleURL = "mapbox://styles/jczaplewski/cmggy9lqq005l01ryhb5o2eo4";

  const [baseStyle, setBaseStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    if (baseStyleURL == null) return;
    getMapboxStyle(baseStyleURL, {
      access_token: mapboxToken,
    }).then((baseStyle) => {
      setBaseStyle(baseStyle);
    });
  }, [baseStyleURL]);

  const overlayStyle = useMemo(() => {
    if (!showOverlay) {
      return null;
    }
    return buildDisplayOverlayStyle(baseURL, {
      selectedLayer: 22, // composite layer
    });
  }, [showOverlay]);

  const demURL = useDEMTileURL();

  const demSource = useMemo(() => {
    if (demURL == null || !showContours) return null;
    const src = new mlcontour.DemSource({
      url: demURL,
      encoding: "mapbox", // "mapbox" or "terrarium" default="terrarium"
      maxzoom: 14,
      worker: true, // offload isoline computation to a web worker to reduce jank
      cacheSize: 50, // number of most-recent tiles to cache
      timeoutMs: 20_000, // timeout on fetch requests
    });
    src.setupMaplibre(maplibre);
    return src;
  }, [demURL, showContours]);

  const terrainTileURL = demSource?.sharedDemProtocolUrl ?? demURL;

  const finalStyle = useMemo(() => {
    if (baseStyle == null && overlayStyle == null) {
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
      sources: {},
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
                  10: [20, 200],
                  12: [10, 100],
                },
                contourLayer: "contours",
                elevationKey: "ele",
                levelKey: "level",
              }),
            ],
            maxzoom: 14,
          },
          // terrain: {
          //   type: "raster-dem",
          //   url: terrainTileURL,
          //   tileSize: 256,
          //   maxzoom: 14,
          // },
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
              "line-width": ["match", ["get", "level"], 1, 1, 0.5],
            },
          },
          // {
          //   id: "contour-labels",
          //   type: "symbol",
          //   source: "contour",
          //   "source-layer": "contours",
          //   filter: [">", ["get", "level"], 0],
          //   layout: {
          //     "symbol-placement": "line",
          //     "text-size": 10,
          //     "text-field": ["to-string", ["get", "ele"]],
          //     "text-font": ["PT Serif Regular"],
          //     "symbol-spacing": 1,
          //     "text-max-angle": 45,
          //   },
          //   paint: {
          //     "text-halo-color": "white",
          //     "text-halo-width": 1,
          //     "text-color": "#444",
          //   },
          // },
        ],
      };
    }

    const clipSlug = crossSectionClipContext ?? contextSlug;

    let crossSectionLabelLayers: maplibre.LayerSpecification[] = [];

    if (showCrossSectionLabels) {
      crossSectionLabelLayers = [
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
      ];
    }

    const crossSectionsStyle = {
      sources: {
        crossSections: {
          type: "geojson",
          data: `${apiBaseURL}/cross_sections.geojson?project_id=eq.${projectID}&order=name.asc&is_public=eq.true&clip_context_slug=eq.${clipSlug}`,
        },
        crossSectionEndpoints: {
          type: "geojson",
          data: `${apiBaseURL}/cross_section_endpoints.geojson?project_id=eq.${projectID}&is_public=eq.true&clip_context_slug=eq.${clipSlug}`,
        },
      },
      layers: [
        {
          id: "cross-section-lines",
          type: "line",
          source: "crossSections",
          paint: {
            "line-color": "#000",
            "line-width": 2.5,
            "line-opacity": 1,
          },
        },
        ...crossSectionLabelLayers,
      ],
    };

    if (baseStyle == null) return null;

    //return baseStyle;

    // Stations

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

    let style1 = mergeStyles(
      baseStyle,
      mainStyle,
      contourStyle,
      overlayStyle,
      crossSectionsStyle,
      stationsStyle,
    );
    return style1;
  }, [baseStyle, overlayStyle, demSource, showContours]);

  return useMemo(() => {
    if (finalStyle == null) return null;
    const style = prepareStyleForMaplibre(
      optimizeTerrain(finalStyle, terrainTileURL),
      mapboxToken,
    );
    return style;
  }, [finalStyle, mapboxToken, terrainTileURL]);
}

function optimizeTerrain(
  style: StyleSpecification | null,
  terrainSourceURL: string | null,
) {
  for (const [key, source] of Object.entries(style.sources)) {
    if (source.type === "raster-dem" && source.url != terrainSourceURL) {
      delete style.sources[key];
    }
  }

  style.sources.terrain = {
    type: "raster-dem",
    tiles: [terrainSourceURL],
    tileSize: 512,
    maxzoom: 14,
  };

  for (const layer of style.layers) {
    if (layer.type === "hillshade") {
      layer.paint = {
        "hillshade-method": "multidirectional",
        "hillshade-highlight-color": [
          "#ffffffcc",
          "#ffffffcc",
          "#ffffffcc",
          "#ffffffcc",
        ],
        "hillshade-shadow-color": [
          "#00000033",
          "#00000033",
          "#00000033",
          "#00000033",
        ],
        "hillshade-illumination-direction": [270, 315, 0, 45],
        "hillshade-illumination-altitude": [30, 30, 30, 30],
      };
    }
  }

  const oldRasterID = "mapbox://mapbox.terrain-rgb";
  delete style.sources[oldRasterID];
  style.layers = style.layers.map((l) => {
    if (l.source === "mapbox-dem" || l.source === oldRasterID) {
      return {
        ...l,
        source: "terrain",
      };
    }
    return l;
  });

  delete style.terrain;

  return style;
}
