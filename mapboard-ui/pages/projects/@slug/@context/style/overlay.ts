import { allFeatureModes, FeatureMode } from "../state";
import { PolygonStyleIndex } from "./pattern-fills";
import { createLineSymbolLayers,  } from "./line-symbols";

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
    crossSectionConfig,
    useSymbols = true,
    showFacesWithNoUnit = false,
    showTopologyPrimitives = false,
  } = options ?? {};

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
    featureModes = new Set([FeatureMode.Line, FeatureMode.Fill]);
  }

  let params = new URLSearchParams();

  let selectedLayerOpacity = (a, b) => {
    return a;
  };

  const overlayLayers: mapboxgl.Layer[] = [];

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

  const tilesetArray = Array.from(featureModes).map(
    tileLayerNameForFeatureMode,
  );

  if (showTopologyPrimitives) {
    tilesetArray.push("nodes");
    tilesetArray.push("edges");
    overlayLayers.push(...buildTopologyLayers());
  }

  if (tilesetArray.length == 0) {
    // We can't have an empty layer at the moment, so we request line data
    tilesetArray.push("line");
  }

  const compositeTileset = tilesetArray.join(",");

  /** Could also consider separate sources per layer */
  const suffix = getTileQueryParams({
    map_layer: selectedLayer,
    changed,
  });

  sources["mapboard"] = {
    type: "vector",
    tiles: [baseURL + `/tile/${compositeTileset}/{z}/{x}/{y}${suffix}`],
    volatile: true,
  };

  if (featureModes.has(FeatureMode.Fill)) {
    let topoFilters = [filter];

    if (!showFacesWithNoUnit) {
      topoFilters.push(["has", "unit"]);
    }

    layers.push({
      id: "fills",
      type: "fill",
      source: "mapboard",
      "source-layer": "fills",
      paint: {
        "fill-pattern": [
          "image",
          [
            "case",
            ["has", "symbol"],
            [
              "concat",
              ["get", "symbol"],
              ":",
              ["get", "symbol_color"],
              ":",
              ["get", "color"],
            ],
            ["concat", "color:", ["get", "color"]],
          ],
        ],
        "fill-opacity": selectedLayerOpacity(0.5, 0.3),
      },
      filter: ["all", ...topoFilters],
    });
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

  let lineFilter = ["all", filter,  ["!", ["get", "covered"]]];

  if (selectedLayer == null) {
    lineFilter.push(["!=", ["get", "layer"], "none"])
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

    if (useSymbols) {
      layers.push(...createLineSymbolLayers(lineFilter));
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

  return {
    version: 8,
    sources,
    layers: [...layers, ...overlayLayers],
  };
}

export function buildTopologyLayers() {
  return [
    // Edges
    {
      id: "edges",
      type: "line",
      source: "mapboard",
      "source-layer": "edges",
      paint: {
        "line-width": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 12, 2],
        "line-color": "#4f11ab",
      },
    },
    // Nodes
    {
      id: "nodes",
      type: "circle",
      source: "mapboard",
      "source-layer": "nodes",
      "min-zoom": 4,
      layout: {
        "circle-sort-key": ["get", "n_edges"],
      },
      paint: {
        // Small radius when zoomed out and larger when zoomed in
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 0, 0.5, 12, 3],
        "circle-color": [
          "interpolate",
          ["linear"],
          ["get", "n_edges"],
          1,
          "#d20045",
          2,
          "#4f11ab",
          4,
          "#606ad9",
        ],
      },
    },
  ];
}

function tileLayerNameForFeatureMode(mode: FeatureMode): string {
  switch (mode) {
    case FeatureMode.Fill:
      return "fills";
    case FeatureMode.Line:
      return "lines";
    case FeatureMode.Polygon:
      return "polygons";
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
