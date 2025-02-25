import { allFeatureModes, FeatureMode } from "../state";
import { PolygonStyleIndex } from "./pattern-fills";

export interface SourceChangeTimestamps {
  line: number | null;
  polygon: number | null;
  topology: number | null;
}

interface MapOverlayOptions {
  selectedLayer: number | null;
  sourceChangeTimestamps: SourceChangeTimestamps;
  enabledFeatureModes?: Set<FeatureMode>;
  showLineEndpoints?: boolean;
  mapSymbolIndex?: PolygonStyleIndex | null;
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
  } = options;

  let filter: any = ["!=", "map_layer", ""];
  if (selectedLayer != null) {
    filter = ["==", "map_layer", selectedLayer];
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

  console.log("Map symbol index", mapSymbolIndex);

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
      //filter: ["!", mapSymbolFilter],
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
      filter: mapSymbolFilter,
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
      //filter,
    });
  }

  if (enabledFeatureModes.has(FeatureMode.Line)) {
    layers.push({
      id: "lines",
      type: "line",
      source: "mapboard_line",
      "source-layer": "lines",
      paint: {
        "line-color": [
          "case",
          ["==", ["get", "color"], "none"],
          "#000000",
          ["get", "color"],
        ],
        "line-width": 1.5,
        "line-opacity": selectedLayerOpacity(1, 0.5),
      },
      //filter,
    });
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
