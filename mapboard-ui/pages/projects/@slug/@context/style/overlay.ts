import { allFeatureModes, FeatureMode } from "../state";
import { PolygonStyleIndex } from "./pattern-fills";
import { createLineSymbolLayers, LineSymbolIndex } from "./line-symbols";

export interface SourceChangeTimestamps {
  [key: FeatureMode]: number | null;
}

export interface CrossSectionConfig {
  layerID: number;
  enabled: boolean;
}

interface MapOverlayOptions {
  selectedLayer: number | null;
  sourceChangeTimestamps: SourceChangeTimestamps;
  enabledFeatureModes?: Set<FeatureMode>;
  showLineEndpoints?: boolean;
  showFacesWithNoUnit?: boolean;
  showTopologyPrimitives?: boolean;
  useSymbols?: boolean;
  polygonSymbolIndex?: PolygonStyleIndex | null;
  lineSymbolIndex?: LineSymbolIndex | null;
  crossSectionConfig?: CrossSectionConfig;
}

export function buildMapOverlayStyle(
  baseURL: string,
  options: MapOverlayOptions,
) {
  const {
    showLineEndpoints = true,
    selectedLayer,
    enabledFeatureModes = allFeatureModes,
    sourceChangeTimestamps,
    polygonSymbolIndex,
    lineSymbolIndex,
    crossSectionConfig,
    useSymbols = true,
    showFacesWithNoUnit = false,
    showTopologyPrimitives = false,
  } = options;

  // Disable rivers and roads by default
  let disabledLayers: number[] = [3, 4];
  if (crossSectionConfig != null) {
    console.log("Cross section config", crossSectionConfig);
    if (!crossSectionConfig.enabled) {
      disabledLayers.push(crossSectionConfig.layerID);
    }
  }

  let featureModes: Set<FeatureMode> = enabledFeatureModes;

  let filter: any = ["literal", true];

  if (selectedLayer == null) {
    filter = ["!", ["in", ["get", "map_layer"], ["literal", disabledLayers]]];
    featureModes = new Set([FeatureMode.Line, FeatureMode.Face]);
  }

  let params = new URLSearchParams();

  let selectedLayerOpacity = (a, b) => {
    return a;
  };

  let sources: Record<string, mapboxgl.SourceSpecification> = {
    "mapbox-dem": {
      type: "raster-dem",
      url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      tileSize: 512,
      maxzoom: 14,
    },
  };

  let layers: mapboxgl.Layer[] = [];

  // Timestamp of the most recent change to a layer
  const changed = getMostRecentTimestamp(sourceChangeTimestamps);

  if (selectedLayer != null) {
    params.set("map_layer", selectedLayer.toString());
    selectedLayerOpacity = (a, b) => {
      return ["case", ["==", ["get", "map_layer"], selectedLayer], a, b];
    };
  }

  let lyr = Array.from(featureModes).map(tileLayerNameForFeatureMode).join(",");
  if (lyr.length == 0) {
    // We can't have an empty layer at the moment, so we request line data
    lyr = "line";
  }

  /** Could also consider separate sources per layer */
  const suffix = getTileQueryParams({
    map_layer: selectedLayer,
    changed,
  });

  sources["mapboard"] = {
    type: "vector",
    tiles: [baseURL + `/tile/${lyr}/{z}/{x}/{y}${suffix}`],
    volatile: true,
  };

  if ((polygonSymbolIndex == null || lineSymbolIndex == null) && useSymbols) {
    return {
      version: 8,
      sources,
      layers,
    };
  }

  if (featureModes.has(FeatureMode.Face)) {
    let paint = {
      "fill-color": ["get", "color"],
      //"fill-opacity": selectedLayerOpacity(0.5, 0.3),
    };

    let topoFilters = [filter];

    if (!showFacesWithNoUnit) {
      topoFilters.push(["has", "type"]);
    }

    // Fill pattern layers
    layers.push({
      id: "faces",
      type: "fill",
      source: "mapboard",
      "source-layer": "faces",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": selectedLayerOpacity(0.5, 0.3),
      },
      filter: ["all", ...topoFilters],
    });

    if (useSymbols) {
      const ix = ["literal", polygonSymbolIndex];

      const mapSymbolFilter: any[] = ["has", ["get", "type"], ix];

      layers.push({
        id: "faces-patterns",
        type: "fill",
        source: "mapboard",
        "source-layer": "faces",
        paint: {
          "fill-color": ["get", "color"],
          "fill-pattern": [
            "coalesce",
            ["image", ["get", ["get", "type"], ix]],
            ["image", "transparent"],
          ],
          "fill-opacity": selectedLayerOpacity(0.5, 0.3),
        },
        filter: ["all", ...topoFilters, mapSymbolFilter],
      });
    }
  }

  if (featureModes.has(FeatureMode.Polygon)) {
    layers.push({
      id: "polygons",
      type: "fill",
      source: "mapboard",
      "source-layer": "polygons",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": selectedLayerOpacity(0.8, 0.4),
      },
      filter,
    });
  }

  let lineColor = [
    "case",
    // ["==", ["get", "color"], "none"],
    // "#000000",
    [
      "in",
      ["get", "type"],
      ["literal", ["thrust-fault", "normal-fault", "fault"]],
    ],
    "#000000",
    ["get", "color"],
  ];

  let lineWidth: any = 1;
  lineWidth = [
    "case",
    [
      "in",
      ["get", "type"],
      ["literal", ["thrust-fault", "normal-fault", "fault"]],
    ],
    1.5,
    1,
  ];

  let lineFilter = filter;
  if (selectedLayer == null) {
    lineFilter = ["all", filter, ["!=", ["get", "layer"], "none"]];
  }

  if (featureModes.has(FeatureMode.Line)) {
    // A single layer for all lines
    layers.push({
      id: "lines",
      type: "line",
      source: "mapboard",
      "source-layer": "lines",
      paint: {
        "line-color": lineColor,
        "line-width": lineWidth,
        "line-opacity": selectedLayerOpacity(1, 0.5),
      },
      filter: lineFilter,
    });

    if (lineSymbolIndex != null && useSymbols) {
      layers.push(...createLineSymbolLayers(lineSymbolIndex, lineFilter));
    }
  }

  if (showLineEndpoints) {
    layers.push({
      id: "points",
      type: "circle",
      source: "mapboard",
      "source-layer": "endpoints",
      paint: {
        "circle-color": [
          "case",
          ["==", ["get", "color"], "none"],
          "#000000",
          ["get", "color"],
        ],
        "circle-radius": 2,
      },
      filter,
    });
  }

  if (showTopologyPrimitives) {
    const suffix = getTileQueryParams({
      changed,
    });
    sources["mapboard-topology"] = {
      type: "vector",
      tiles: [baseURL + `/tile/node,edge/{z}/{x}/{y}${suffix}`],
      volatile: true,
    };

    layers.push({
      id: "topo-edges",
      type: "line",
      source: "mapboard-topology",
      "source-layer": "edges",
      paint: {
        "line-color": "rgb(217, 23, 128)",
        "line-width": 1.2,
      },
    });

    layers.push({
      id: "topo-nodes",
      type: "circle",
      source: "mapboard-topology",
      "source-layer": "nodes",
      paint: {
        "circle-color": "rgb(217, 23, 128)",
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          2,
          1.5,
          7,
          2.2,
          12,
          3,
        ],
      },
    });
  }

  return {
    version: 8,
    sources,
    layers,
  };
}

function tileLayerNameForFeatureMode(mode: FeatureMode): string {
  switch (mode) {
    case FeatureMode.Face:
      return "topology";
    case FeatureMode.Line:
      return "line";
    case FeatureMode.Polygon:
      return "polygon";
  }
}

function getTileQueryParams(params: Record<string, any>) {
  let suffix = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) {
      continue;
    }
    let val = value;
    // If has "toString" method, use it
    if (value.toString) {
      val = value.toString();
    }
    suffix.set(key, val);
  }

  let str = suffix.toString();
  if (str.length > 0) {
    str = "?" + str;
  }

  return str;
}

function getMostRecentTimestamp(timestamps: SourceChangeTimestamps): number {
  return Math.max(...Object.values(timestamps).map((x) => x ?? 0));
}
