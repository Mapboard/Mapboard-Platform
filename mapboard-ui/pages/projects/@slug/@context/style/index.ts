import { useEffect, useMemo, useState } from "react";
import { useAsyncEffect, useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, useMapState } from "../state";
import { buildGeoJSONSource, mergeStyles } from "@macrostrat/mapbox-utils";
import { buildMapOverlayStyle, CrossSectionConfig } from "./overlay";
import { buildSelectionLayers } from "../selection";
import { buildCrossSectionLayers } from "@macrostrat/map-styles";
import { GeoJSONFeature, GeoJSONSource } from "mapbox-gl";
import { getCSSVariable } from "@macrostrat/color-utils";

export { buildMapOverlayStyle };

function useBaseMapStyle(basemapType: BasemapType) {
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

export function useMapStyle(
  baseURL: string,
  { mapboxToken, isMapView = true }: MapStyleOptions,
) {
  const activeLayer = useMapState((state) => state.activeLayer);
  const basemapType = useMapState((state) => state.baseMap);
  const changeTimestamps = useMapState((state) => state.lastChangeTime);
  const showLineEndpoints = useMapState((state) => state.showLineEndpoints);
  const enabledFeatureModes = useMapState((state) => state.enabledFeatureModes);

  const showCrossSectionLines = useMapState((d) => d.showCrossSectionLines);
  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showOverlay = useMapState((d) => d.showOverlay);
  const exaggeration = useMapState((d) => d.terrainExaggeration);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);
  const showCrossSections = useMapState((d) => d.showCrossSectionLines);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [overlayStyle, setOverlayStyle] = useState(null);

  useEffect(() => {
    if (!showOverlay) {
      setOverlayStyle(null);
      return;
    }
    const style = buildMapOverlayStyle(baseURL, {
      selectedLayer: activeLayer,
      sourceChangeTimestamps: changeTimestamps,
      enabledFeatureModes,
      showLineEndpoints,
      showFacesWithNoUnit,
      showTopologyPrimitives,
    });
    const selectionStyle: any = { layers: buildSelectionLayers() };

    let crossSectionStyle: any = null;
    if (showCrossSections) {
      const sections: GeoJSONFeature[] = [];
      // Fetch cross sections from the server or state
      // sections = await fetchCrossSections(contextID);
      crossSectionStyle = createCrossSectionsStyle(sections);
    }

    setOverlayStyle(mergeStyles(style, selectionStyle, crossSectionStyle));
  }, [
    activeLayer,
    changeTimestamps,
    showLineEndpoints,
    enabledFeatureModes,
    showCrossSectionLines,
    showFacesWithNoUnit,
    showOverlay,
    showTopologyPrimitives,
    showCrossSections,
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

export function createCrossSectionsStyle(sections: GeoJSONFeature[]) {
  const color = getCSSVariable("--panel-background-color") ?? "white";

  return {
    version: 8,
    layers: [
      {
        id: "cross-section-lines",
        type: "line",
        source: "crossSectionLine",
        paint: {
          "line-color": color,
          "line-width": ["case", ["feature-state", "active"], 4, 2],
          "line-opacity": ["case", ["feature-state", "active"], 1, 0.2],
        },
      },
      {
        id: "cross-section-endpoints",
        type: "circle",
        source: "crossSectionLine",
        paint: {
          "circle-radius": 5,
          "circle-color": color,
          "circle-opacity": 1,
        },
      },
    ],
    sources: {
      crossSectionLine: buildGeoJSONSource(),
      crossSectionEndpoints: buildGeoJSONSource(),
      elevationMarker: buildGeoJSONSource(),
    },
  };
}

const color = "#e350a3";
