import { createLineSymbolLayers } from "./line-symbols";
import { allFeatureModes, FeatureMode } from "../types";

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
  styleMode?: "display" | "edit";
  // Restrict to bounds
  clipToContextBounds?: boolean;
  opacity?: number;
}

export function buildMapOverlayStyle(
  baseURL: string,
  options: MapOverlayOptions,
): mapboxgl.StyleSpecification {
  const {
    showLineEndpoints = true,
    selectedLayer,
    enabledFeatureModes = allFeatureModes,
    sourceChangeTimestamps,
    useSymbols = true,
    showFacesWithNoUnit = false,
    showTopologyPrimitives = false,
    clipToContextBounds = false,
    styleMode = "edit",
    opacity = 1.0,
  } = options ?? {};

  // Disable rivers and roads by default
  let disabledLayers: number[] = [];

  let featureModes: Set<FeatureMode> = enabledFeatureModes;

  let filter: any = ["literal", true];

  if (selectedLayer == null) {
    filter = ["!", ["in", ["get", "map_layer"], ["literal", disabledLayers]]];
  }

  let params = new URLSearchParams();

  let selectedLayerOpacity = (a, b) => {
    return a * opacity;
  };

  const overlayLayers: mapboxgl.Layer[] = [];

  let sources: Record<string, mapboxgl.SourceSpecification> = {};

  let layers: mapboxgl.Layer[] = [];

  // Timestamp of the most recent change to a layer
  const changed = getMostRecentTimestamp(sourceChangeTimestamps);

  if (selectedLayer != null) {
    params.set("map_layer", selectedLayer.toString());
    selectedLayerOpacity = (a, b) => {
      return [
        "case",
        ["==", ["get", "map_layer"], selectedLayer],
        a * opacity,
        b * opacity,
      ];
    };
  }

  // always include all feature modes to ensure that styles reload quickly
  // we could change this eventually...
  const allModes = new Set<FeatureMode>([
    FeatureMode.Fill,
    FeatureMode.Line,
    FeatureMode.Polygon,
  ]);
  const tilesetArray = Array.from(allModes).map(tileLayerNameForFeatureMode);

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

  let p0: any = {
    map_layer: selectedLayer,
    changed,
  };
  if (clipToContextBounds) {
    p0.clip = true;
  }

  const suffix = getTileQueryParams(p0);

  sources["mapboard"] = {
    type: "vector",
    tiles: [baseURL + `/tile/${compositeTileset}/{z}/{x}/{y}${suffix}`],
    volatile: true,
  };

  if (featureModes.has(FeatureMode.Fill)) {
    let topoFilters = [filter];

    if (!showFacesWithNoUnit || styleMode === "display") {
      topoFilters.push(["has", "unit"]);
    }

    layers.push({
      id: "fills-without-symbols",
      type: "fill",
      source: "mapboard",
      "source-layer": "fills",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": selectedLayerOpacity(0.5, 0.3),
        "fill-outline-color": "transparent",
      },
      filter: ["all", ["!", ["has", "symbol"]], ...topoFilters],
    });

    layers.push({
      id: "fills-with-symbols",
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
        "fill-outline-color": "transparent",
      },
      filter: ["all", ["has", "symbol"], ...topoFilters],
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

  let baseLineWidth = 1;
  if (styleMode === "display") {
    // In display mode, we use a smaller base line width
    baseLineWidth = 0.5;
  }

  let displayCases: any = [];

  if (styleMode === "display") {
    // Add special cases for certain layers
    displayCases = [["==", ["get", "layer"], 8], 3];
  }

  let lineWidth: any = baseLineWidth;
  lineWidth = [
    "case",
    ...displayCases,
    [
      "in",
      ["get", "type"],
      ["literal", ["thrust-fault", "normal-fault", "fault"]],
    ],
    2 * baseLineWidth,
    baseLineWidth,
  ];

  let lineFilter = ["all", filter, ["!", ["get", "covered"]]];

  if (selectedLayer == null) {
    lineFilter.push(["!=", ["get", "layer"], "none"]);
  }

  if (styleMode === "display") {
    lineFilter.push(["!=", ["get", "type"], "mapboard:arbitrary"]);
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
