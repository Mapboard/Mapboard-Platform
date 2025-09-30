import { useEffect, useMemo, useState } from "react";
import { useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, useMapState } from "../state";
import { mergeStyles } from "@macrostrat/mapbox-utils";
import { buildMapOverlayStyle, CrossSectionConfig } from "./overlay";
import { buildSelectionLayers } from "../selection";
import { atom, useAtom, useAtomValue } from "jotai";
import mapboxgl from "mapbox-gl";
import { atomWithStorage } from "jotai/utils";

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

export function useMapStyle(
  baseURL: string,
  { mapboxToken, isMapView = true }: MapStyleOptions,
) {
  const activeLayer = useMapState((state) => state.activeLayer);
  const basemapType = useMapState((state) => state.baseMap);
  const changeTimestamps = useMapState((state) => state.lastChangeTime);
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const enabledFeatureModes = useMapState((state) => state.enabledFeatureModes);

  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showOverlay = useMapState((d) => d.showOverlay);
  const exaggeration = useMapState((d) => d.terrainExaggeration);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);
  const styleMode = useMapState((d) => d.styleMode);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [overlayStyle, setOverlayStyle] = useAtom(overlayStyleAtom);
  const clipToContextBounds = useAtomValue(overlayClipAtom);

  useEffect(() => {
    if (!showOverlay) {
      setOverlayStyle(null);
      return;
    }
    const style = buildMapOverlayStyle(baseURL, {
      // We want to show all layers if in a cross-section view (at least for now
      selectedLayer: isMapView ? activeLayer : null,
      sourceChangeTimestamps: changeTimestamps,
      enabledFeatureModes,
      showLineEndpoints,
      showFacesWithNoUnit,
      showTopologyPrimitives,
      styleMode,
      clipToContextBounds,
    });
    const selectionStyle: any = { layers: buildSelectionLayers() };

    setOverlayStyle(mergeStyles(style, selectionStyle));
  }, [
    activeLayer,
    changeTimestamps,
    showLineEndpoints,
    enabledFeatureModes,
    showFacesWithNoUnit,
    showOverlay,
    showTopologyPrimitives,
    clipToContextBounds,
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
        "mapbox-dem": {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        },
      },
      terrain: {
        source: "mapbox-dem",
        exaggeration,
      },
      // Use the new imports syntax for basemap styles.
      // This allows us to provide our own sprites
      imports: [
        {
          id: "basemap",
          url: baseStyleURL,
        },
      ],
    };

    const style = mergeStyles(overlayStyle, mainStyle);
    console.log("Setting style", style);
    return style;
  }, [baseStyleURL, overlayStyle, exaggeration]);
}

const color = "#e350a3";
