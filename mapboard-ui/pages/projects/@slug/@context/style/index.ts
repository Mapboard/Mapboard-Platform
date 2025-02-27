import { useEffect, useMemo, useState } from "react";
import { useAsyncEffect, useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, PolygonDataType, useMapState } from "../state";
import { getMapboxStyle, mergeStyles } from "@macrostrat/mapbox-utils";
import { buildMapOverlayStyle, CrossSectionConfig } from "./overlay";
import { buildSelectionLayers } from "../_tools";
import {
  PolygonPatternConfig,
  PolygonStyleIndex,
  setupStyleImages,
} from "./pattern-fills";
import { useMapRef, useMapStatus } from "@macrostrat/mapbox-react";
import { show } from "@blueprintjs/core/lib/esnext/legacy/contextMenuLegacy";

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
  const crossSectionLayerID: number | null = useMapState(
    (state) => state.mapLayers?.find((d) => d.name == "Sections")?.id,
  );
  const showCrossSectionLines = useMapState((d) => d.showCrossSectionLines);
  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showOverlay = useMapState((d) => d.showOverlay);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [baseStyle, setBaseStyle] = useState(null);
  const [overlayStyle, setOverlayStyle] = useState(null);

  const mapSymbolIndex = useMapSymbols();

  const crossSectionConfig: CrossSectionConfig = {
    layerID: crossSectionLayerID,
    enabled: showCrossSectionLines,
  };

  useEffect(() => {
    if (!isMapView) {
      setBaseStyle(null);
      return;
    }
    getMapboxStyle(baseStyleURL, {
      access_token: mapboxToken,
    }).then(setBaseStyle);
  }, [baseStyleURL, mapboxToken, isMapView]);

  useAsyncEffect(async () => {
    console.log("Building overlay style", showOverlay);
    if (!showOverlay) {
      setOverlayStyle(null);
      return;
    }
    const style = buildMapOverlayStyle(baseURL, {
      selectedLayer: activeLayer,
      sourceChangeTimestamps: changeTimestamps,
      enabledFeatureModes,
      showLineEndpoints,
      mapSymbolIndex,
      crossSectionConfig,
      showFacesWithNoUnit,
    });
    const selectionStyle: any = { layers: buildSelectionLayers() };
    setOverlayStyle(mergeStyles(style, selectionStyle));
  }, [
    activeLayer,
    changeTimestamps,
    showLineEndpoints,
    enabledFeatureModes,
    mapSymbolIndex,
    showCrossSectionLines,
    showFacesWithNoUnit,
    showOverlay,
  ]);

  return useMemo(() => {
    if (baseStyle == null && overlayStyle == null) {
      return null;
    }

    return mergeStyles(baseStyle, overlayStyle);
  }, [baseStyle, overlayStyle]);
}

export function useMapSymbols(): PolygonStyleIndex | null {
  const polygonTypes = useMapState((state) => state.dataTypes.polygon);

  const map = useMapRef();
  const isInitialized = useMapStatus((state) => state.isInitialized);

  return useAsyncMemo(async () => {
    if (map.current == null || polygonTypes == null) {
      return null;
    }

    const symbols: PolygonPatternConfig[] = polygonTypes
      ?.map((d) => {
        const sym = d.symbology;
        return {
          color: d.color,
          id: d.id,
          symbol: sym?.name,
          symbolColor: sym?.color,
        };
      })
      .filter((d) => d.symbol != null);

    const patternBaseURL = "/assets/geologic-patterns/svg";
    console.log("Setting up style images", symbols);
    return await setupStyleImages(map.current, symbols, { patternBaseURL });
  }, [polygonTypes, map.current, isInitialized]);
}

function useAsyncMemo<T>(fn: () => Promise<T>, deps: any[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    fn().then(setValue);
  }, deps);
  return value;
}
