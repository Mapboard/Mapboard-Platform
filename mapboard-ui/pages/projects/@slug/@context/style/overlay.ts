import { allFeatureModes, FeatureMode } from "../state";
import { PolygonStyleIndex } from "./pattern-fills";
import { createLineSymbolLayers } from "@macrostrat/map-styles";

export interface SourceChangeTimestamps {
  line: number | null;
  polygon: number | null;
  topology: number | null;
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
  mapSymbolIndex?: PolygonStyleIndex | null;
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
    mapSymbolIndex,
    crossSectionConfig,
    showFacesWithNoUnit = false,
  } = options;

  // Disable rivers and roads by default
  let disabledLayers: number[] = [3, 4];
  if (crossSectionConfig != null) {
    console.log("Cross section config", crossSectionConfig);
    if (!crossSectionConfig.enabled) {
      disabledLayers.push(crossSectionConfig.layerID);
    }
  }

  let filter: any = null;

  if (selectedLayer != null) {
    filter = ["==", ["get", "map_layer"], selectedLayer];
  } else {
    filter = ["!", ["in", ["get", "map_layer"], ["literal", disabledLayers]]];
  }

  let params = new URLSearchParams();

  let selectedLayerOpacity = (a, b) => {
    return a;
  };
  if (selectedLayer != null) {
    params.set("map_layer", selectedLayer.toString());
    selectedLayerOpacity = (a, b) => {
      return ["case", ["==", ["get", "map_layer"], selectedLayer], a, b];
    };
  }

  let sources: Record<string, mapboxgl.SourceSpecification> = {
    "mapbox-dem": {
      type: "raster-dem",
      url: "mapbox://mapbox.mapbox-terrain-dem-v1",
      tileSize: 512,
      maxzoom: 14,
    },
  };

  for (const lyr of [
    "polygon",
    "line",
    "topology",
  ] as (keyof SourceChangeTimestamps)[]) {
    const time = sourceChangeTimestamps[lyr];
    if (time != null) {
      params.set("changed", time.toString());
    }

    let suffix = params.toString();
    if (suffix.length) {
      suffix = "?" + suffix;
    }

    sources["mapboard_" + lyr] = {
      type: "vector",
      tiles: [baseURL + `/${lyr}/tile/{z}/{x}/{y}${suffix}`],
      volatile: true,
    };
  }

  let layers: mapboxgl.Layer[] = [];

  if (mapSymbolIndex == null) {
    return {
      version: 8,
      sources,
      layers,
    };
  }

  if (enabledFeatureModes.has(FeatureMode.Topology)) {
    let paint = {
      "fill-color": ["get", "color"],
      //"fill-opacity": selectedLayerOpacity(0.5, 0.3),
    };

    const ix = ["literal", mapSymbolIndex];

    const mapSymbolFilter: any[] = ["has", ["get", "type"], ix];

    let topoFilters = [filter];

    if (!showFacesWithNoUnit) {
      topoFilters.push(["has", "type"]);
    }

    // Fill pattern layers
    layers.push({
      id: "topology_colors",
      type: "fill",
      source: "mapboard_topology",
      "source-layer": "faces",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": selectedLayerOpacity(0.5, 0.3),
      },
      filter: ["all", ...topoFilters],
    });

    layers.push({
      id: "unit_patterns",
      type: "fill",
      source: "mapboard_topology",
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

  if (enabledFeatureModes.has(FeatureMode.Polygon)) {
    layers.push({
      id: "polygons",
      type: "fill",
      source: "mapboard_polygon",
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
    ["==", ["get", "color"], "none"],
    "#000000",
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

  if (enabledFeatureModes.has(FeatureMode.Line)) {
    // A single layer for all lines
    layers.push({
      id: "lines",
      type: "line",
      source: "mapboard_line",
      "source-layer": "lines",
      paint: {
        "line-color": lineColor,
        "line-width": lineWidth,
        "line-opacity": selectedLayerOpacity(1, 0.5),
      },
      filter: lineFilter,
    });
    layers.push(
      ...createLineSymbolLayers().map((val: any) => {
        let newPaint = val.paint;
        if (val.id == "normal-fault-stroke") {
          newPaint["icon-color"] = "#000000";
        }

        return {
          ...val,
          source: "mapboard_line",
          "source-layer": "lines",
          filter: ["all", lineFilter, val.filter],
          //paint: newPaint,
        };
      }),
    );
  }

  if (showLineEndpoints) {
    layers.push({
      id: "points",
      type: "circle",
      source: "mapboard_line",
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
    layers,
  };
}
