import { useEffect, useMemo, useState } from "react";
import { useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, useMapState } from "../state";
import { getMapboxStyle, mergeStyles } from "@macrostrat/mapbox-utils";
import { buildMapOverlayStyle, MapOverlayOptions } from "./overlay";
import { buildSelectionLayers } from "../selection";
import { Atom, atom, useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { acceptedRevisionAtom, mapReloadCounterAtom } from "../change-watcher";
import { apiBaseURL } from "~/settings";
import { useMapRef } from "@macrostrat/mapbox-react";
import { StyleSpecification } from "mapbox-gl";
import { createStationsLayer } from "./station-layers";

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

export interface MapStyleOptions {
  mapboxToken: string;
  isMapView: boolean;
  projectID: number;
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

export function useMapRevision(revisionAtom: Atom<number>): [number, number] {
  const mapRef = useMapRef();
  const revision = useAtomValue(revisionAtom);
  const [acceptedRevision, setAcceptedRevision] = useState<number>(revision);

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

  return [revision, acceptedRevision];
}

export function useMapStyle(
  baseURL: string,
  { mapboxToken, isMapView = true, projectID }: MapStyleOptions,
) {
  const activeLayer = useMapState((state) => state.activeLayer);
  const basemapType = useMapState((state) => state.baseMap);
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const enabledFeatureModes = useMapState((state) => state.enabledFeatureModes);

  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showOverlay = useMapState((d) => d.showOverlay);
  const exaggeration = useMapState((d) => d.terrainExaggeration);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);
  const styleMode = useMapState((d) => d.styleMode);

  const [revision, acceptedRevision] = useMapRevision(mapReloadCounterAtom);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [overlayStyle, setOverlayStyle] = useAtom(overlayStyleAtom);
  const clipToContextBounds = useAtomValue(overlayClipAtom);

  const overlayOpacity = useAtomValue(overlayOpacityAtom);

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
    return style;
  }, [baseStyle, overlayStyle, exaggeration]);
}
