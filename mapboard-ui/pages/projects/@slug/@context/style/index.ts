import { useEffect, useMemo, useRef, useState } from "react";
import { useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, useMapState } from "../state";
import { getMapboxStyle, mergeStyles } from "@macrostrat/mapbox-utils";
import {
  buildDisplayOverlayStyle,
  buildMapOverlayStyle,
  MapOverlayOptions,
} from "./overlay";
import { buildSelectionLayers } from "../selection";
import { atom, useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { mapReloadTimestampAtom } from "../change-watcher";
import { apiBaseURL } from "~/settings";
import { useMapRef } from "@macrostrat/mapbox-react";
import { StyleSpecification } from "mapbox-gl";
import { createStationsLayer } from "./station-layers";
import mlcontour from "maplibre-contour";
import { useDEMTileURL } from "../transform-request";
import maplibre from "maplibre-gl";
import { DemSource } from "maplibre-contour/dist/dem-source";

export { buildMapOverlayStyle };

export function useBaseMapStyle(basemapType: BasemapType) {
  const isEnabled = useInDarkMode();

  let baseStyle = isEnabled
    ? "mapbox://styles/mapbox/dark-v10"
    : "mapbox://styles/mapbox/light-v10";
  if (basemapType == "satellite") {
    baseStyle = "mapbox://styles/mapbox/satellite-v9";
  } else if (basemapType == "terrain") {
    baseStyle = isEnabled
      ? "mapbox://styles/jczaplewski/ckfxmukdy0ej619p7vqy19kow"
      : "mapbox://styles/jczaplewski/ckxcu9zmu4aln14mfg4monlv3";

    //     // mapbox://styles/jczaplewski/cmggy9lqq005l01ryhb5o2eo4
  }
  return baseStyle;
}

interface MapStyleOptions {
  mapboxToken: string;
  isMapView: boolean;
}

const overlayStyleAtom = atom<mapboxgl.StyleSpecification | null>(null);

const styleLayerIDsAtom = atom<string[]>((get) => {
  const overlayStyle = get(overlayStyleAtom);
  if (overlayStyle == null) return [];
  return overlayStyle.layers.map((l) => l.id);
});

export function useStyleLayerIDs() {
  return useAtomValue(styleLayerIDsAtom);
}

export const overlayClipAtom = atomWithStorage<boolean>(
  "mapboard:clip-overlay",
  false,
);

export const overlayOpacityAtom = atomWithStorage<number>(
  "mapboard:overlay-opacity",
  1.0,
);

export function useMapStyle(
  baseURL: string,
  { mapboxToken, isMapView = true }: MapStyleOptions,
) {
  const activeLayer = useMapState((state) => state.activeLayer);
  const basemapType = useMapState((state) => state.baseMap);
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const enabledFeatureModes = useMapState((state) => state.enabledFeatureModes);
  const projectID = useMapState((d) => d.context.project_id);

  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showOverlay = useMapState((d) => d.showOverlay);
  const exaggeration = useMapState((d) => d.terrainExaggeration);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);
  const styleMode = useMapState((d) => d.styleMode);

  const revision = useAtomValue(mapReloadTimestampAtom);
  const [acceptedRevision, setAcceptedRevision] = useState<number>(revision);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [overlayStyle, setOverlayStyle] = useAtom(overlayStyleAtom);
  const clipToContextBounds = useAtomValue(overlayClipAtom);

  const overlayOpacity = useAtomValue(overlayOpacityAtom);

  const mapRef = useMapRef();

  const [baseStyle, setBaseStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    if (baseStyleURL == null) return;
    getMapboxStyle(baseStyleURL, {
      access_token: mapboxToken,
    }).then((baseStyle) => {
      console.log(baseStyle);
      setBaseStyle(baseStyle);
    });
  }, [baseStyleURL]);

  // When loading completes, update accepted revision
  useEffect(() => {
    const map = mapRef.current;
    if (map == null) return;
    // Listen for source load
    if (revision === acceptedRevision) return;
    const callback = (evt) => {
      const key = `mapboard-${revision}`;
      if (evt.sourceId != key) return;
      if (!evt.isSourceLoaded) return;
      // Only tile requests, as this signifies that the source has actually loaded data
      if (evt.tile == null) return;
      console.log("Accepting revision", revision);
      setAcceptedRevision(revision);
    };
    map.on("data", callback);
    return () => {
      map.off("data", callback);
    };
  }, [revision, acceptedRevision]);

  useEffect(() => {
    if (!showOverlay) {
      setOverlayStyle(null);
      return;
    }

    const styleOpts: MapOverlayOptions = {
      selectedLayer: isMapView ? activeLayer : null,
      enabledFeatureModes,
      showLineEndpoints,
      showFacesWithNoUnit,
      showTopologyPrimitives,
      styleMode,
      clipToContextBounds,
      opacity: overlayOpacity,
    };

    const style = buildMapOverlayStyle(baseURL, {
      ...styleOpts,
      revision: acceptedRevision,
      visible: true,
    });

    let nextStyle = {};
    if (revision !== acceptedRevision) {
      nextStyle = buildMapOverlayStyle(baseURL, {
        ...styleOpts,
        revision,
        visible: true,
      });
    }

    const stationsStyle: Partial<StyleSpecification> = {
      sources: {
        stations: {
          type: "geojson",
          data: `${apiBaseURL}/stations.geojson?project_id=eq.${projectID}`,
        },
      },
      layers: [
        // createStationsLayer({
        //   id: "points",
        //   sourceID: "stations",
        //   showOrientations: false,
        //   showAll: true,
        // }),
        createStationsLayer({
          id: "orientations",
          sourceID: "stations",
          showOrientations: true,
        }),
      ],
    };

    const selectionStyle: any = {
      layers: buildSelectionLayers(`mapboard-${acceptedRevision}`),
    };

    setOverlayStyle(
      mergeStyles(style, nextStyle, stationsStyle, selectionStyle),
    );
  }, [
    activeLayer,
    showLineEndpoints,
    enabledFeatureModes,
    showFacesWithNoUnit,
    showOverlay,
    revision,
    acceptedRevision,
    showTopologyPrimitives,
    clipToContextBounds,
    overlayOpacity,
  ]);

  return useMemo(() => {
    if (baseStyleURL == null || overlayStyle == null) {
      return null;
    }

    const mainStyle: mapboxgl.StyleSpecification = {
      version: 8,
      name: "Mapboard",
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
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        },
      },
      terrain: {
        source: "terrain",
        exaggeration,
      },
      // Use the new imports syntax for basemap styles.
      // This allows us to provide our own sprites
      // imports: [
      //   {
      //     id: "basemap",
      //     url: baseStyleURL,
      //   },
      // ],
    };

    const style = mergeStyles(baseStyle, overlayStyle, mainStyle);
    console.log("Setting style", style);
    return style;
  }, [baseStyle, overlayStyle, exaggeration]);
}

const demSourceAtom = atom<DemSource | null>(null);

export function useDisplayStyle(
  baseURL: string,
  { mapboxToken, isMapView = true }: MapStyleOptions,
) {
  const activeLayer = useMapState((state) => state.activeLayer);
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const enabledFeatureModes = useMapState((state) => state.enabledFeatureModes);
  const projectID = useMapState((d) => d.context.project_id);

  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showOverlay = useMapState((d) => d.showOverlay);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);
  const styleMode = "display";

  const revision = useAtomValue(mapReloadTimestampAtom);
  const [acceptedRevision, setAcceptedRevision] = useState<number>(revision);

  const baseStyleURL = "mapbox://styles/jczaplewski/cmggy9lqq005l01ryhb5o2eo4";

  const [overlayStyle, setOverlayStyle] = useState(null);
  const clipToContextBounds = true;

  const overlayOpacity = 0.8;

  const mapRef = useMapRef();

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

    const styleOpts: MapOverlayOptions = {
      selectedLayer: isMapView ? activeLayer : null,
      enabledFeatureModes,
      showLineEndpoints,
      showFacesWithNoUnit,
      styleMode,
      clipToContextBounds,
      opacity: overlayOpacity,
    };

    const style = buildDisplayOverlayStyle(baseURL, {
      ...styleOpts,
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
  }, [
    activeLayer,
    showLineEndpoints,
    enabledFeatureModes,
    showFacesWithNoUnit,
    showOverlay,
    revision,
    acceptedRevision,
    showTopologyPrimitives,
    clipToContextBounds,
    overlayOpacity,
  ]);

  const [demSource, setDemSource] = useAtom(demSourceAtom);

  const demURL = useDEMTileURL();

  useEffect(() => {
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
    setDemSource(src);
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
