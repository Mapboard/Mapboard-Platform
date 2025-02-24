import { useEffect, useMemo, useState } from "react";
import { useAsyncEffect, useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, useMapState } from "../state";
import { getMapboxStyle, mergeStyles } from "@macrostrat/mapbox-utils";
import { buildMapOverlayStyle } from "./overlay";
import { buildSelectionLayers } from "../_tools";
import { PolygonPatternConfig, setupStyleImages } from "./pattern-fills";
import { useMapRef } from "@macrostrat/mapbox-react";

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
  const polygonTypes = useMapState((state) => state.dataTypes.polygon);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [baseStyle, setBaseStyle] = useState(null);
  const [overlayStyle, setOverlayStyle] = useState(null);
  const map = useMapRef();

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
    if (map.current != null) {
      const symbols: PolygonPatternConfig[] =
        polygonTypes
          ?.map((d) => {
            const sym = d.symbology;
            if (sym == null) return null;

            return {
              color: d.color,
              id: d.id,
              symbol: sym.name,
              symbolColor: sym.color,
            };
          })
          .filter((d) => d != null) ?? [];

      const patternBaseURL = "/assets/geologic-patterns/svg";
      console.log("Setting up style images", symbols);
      await setupStyleImages(map.current, symbols, { patternBaseURL });
    }

    const style = buildMapOverlayStyle(baseURL, {
      selectedLayer: activeLayer,
      sourceChangeTimestamps: changeTimestamps,
      enabledFeatureModes,
      showLineEndpoints,
    });
    setOverlayStyle(style);
  }, [
    activeLayer,
    changeTimestamps,
    showLineEndpoints,
    enabledFeatureModes,
    polygonTypes,
    map.current,
  ]);

  return useMemo(() => {
    if (baseStyle == null && overlayStyle == null) {
      return null;
    }

    return mergeStyles(baseStyle, overlayStyle, {
      layers: buildSelectionLayers(),
    });
  }, [baseStyle, overlayStyle]);
}
