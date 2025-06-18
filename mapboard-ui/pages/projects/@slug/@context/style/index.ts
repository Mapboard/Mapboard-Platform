import { useEffect, useMemo, useState } from "react";
import { useAsyncEffect, useInDarkMode } from "@macrostrat/ui-components";
import { BasemapType, useMapState } from "../state";
import { mergeStyles } from "@macrostrat/mapbox-utils";
import { buildMapOverlayStyle, CrossSectionConfig } from "./overlay";
import { buildSelectionLayers } from "../selection";
import { PolygonPatternConfig, PolygonStyleIndex } from "./pattern-fills";
import { useMapRef, useMapStatus } from "@macrostrat/mapbox-react";
import { lineSymbols } from "./line-symbols";
import { loadImage } from "./pattern-images";

export * from "./pattern-manager"

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
  const crossSectionLayerID: number | null = useMapState(
    (state) => state.mapLayers?.find((d) => d.name == "Sections")?.id,
  );
  const showCrossSectionLines = useMapState((d) => d.showCrossSectionLines);
  const showFacesWithNoUnit = useMapState((d) => d.showFacesWithNoUnit);
  const showOverlay = useMapState((d) => d.showOverlay);
  const exaggeration = useMapState((d) => d.terrainExaggeration);
  const showTopologyPrimitives = useMapState((d) => d.showTopologyPrimitives);

  const baseStyleURL = useBaseMapStyle(basemapType);

  const [overlayStyle, setOverlayStyle] = useState(null);

  //const polygonSymbolIndex = useMapSymbols();
  const lineSymbolIndex = useLineSymbols();

  const crossSectionConfig: CrossSectionConfig = {
    layerID: crossSectionLayerID,
    enabled: showCrossSectionLines,
  };

  useAsyncEffect(async () => {
    if (!showOverlay) {
      setOverlayStyle(null);
      return;
    }
    const style = buildMapOverlayStyle(baseURL, {
      selectedLayer: activeLayer,
      sourceChangeTimestamps: changeTimestamps,
      enabledFeatureModes,
      showLineEndpoints,
      //polygonSymbolIndex,
      lineSymbolIndex,
      crossSectionConfig,
      showFacesWithNoUnit,
      showTopologyPrimitives,
    });
    const selectionStyle: any = { layers: buildSelectionLayers() };
    setOverlayStyle(mergeStyles(style, selectionStyle));
  }, [
    activeLayer,
    changeTimestamps,
    showLineEndpoints,
    enabledFeatureModes,
    //polygonSymbolIndex,
    lineSymbolIndex,
    showCrossSectionLines,
    showFacesWithNoUnit,
    showOverlay,
    showTopologyPrimitives,
  ]);

  return useMemo(() => {
    if (baseStyleURL == null && overlayStyle == null) {
      return null;
    }

    const mainStyle = {
      version: 8,
      name: "Mapboard",
      layers: [],
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
      //sprite: `https://mapboard.local/styles/sprite/naukluft/main`,
    };

    return mergeStyles(overlayStyle, mainStyle);
  }, [baseStyleURL, overlayStyle, exaggeration]);
}

const color = "#e350a3";

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

    return await setupLineSymbols(map.current);

    //const patternBaseURL = "/assets/geologic-patterns/svg";
    //return await setupStyleImages(map.current, symbols, { patternBaseURL });
  }, [polygonTypes, isInitialized]);
}

type LineStyleIndex = { [key: string]: string };

export function useLineSymbols(): LineStyleIndex | null {
  const map = useMapRef();
  const isInitialized = useMapStatus((state) => state.isInitialized);

  return useAsyncMemo(async () => {
    if (map.current == null) {
      return null;
    }
    return await setupLineSymbols(map.current);
  }, [isInitialized]);
}

function useAsyncMemo<T>(fn: () => Promise<T>, deps: any[]): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    fn().then(setValue);
  }, deps);
  return value;
}

const vizBaseURL = "//visualization-assets.s3.amazonaws.com";
const lineSymbolsURL = vizBaseURL + "/geologic-line-symbols/png";

async function setupLineSymbols(map) {
  const symbols = await Promise.all(
    lineSymbols.map(async function (symbol) {
      if (map.hasImage(symbol)) return symbol;
      const image = await loadImage(lineSymbolsURL + `/${symbol}.png`);
      if (map.hasImage(symbol)) return symbol;
      map.addImage(symbol, image, { sdf: true, pixelRatio: 3 });
      return symbol;
    }),
  );

  return symbols
    .filter((d) => d != null)
    .reduce((acc: LineStyleIndex, d) => {
      acc[d] = d;
      return acc;
    }, {});
}
