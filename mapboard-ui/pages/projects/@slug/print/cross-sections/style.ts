import { createLineSymbolLayers } from "../../@context/style/line-symbols";
import {
  buildFillLayers,
  getTileQueryParams,
  MapOverlayOptions,
} from "../../@context/style/overlay";
import type maplibre from "maplibre-gl";
import { mergeStyles } from "@macrostrat/mapbox-utils";
import type mapboxgl from "mapbox-gl";

export function buildCrossSectionStyle(baseURL: string, opts = {}) {
  const { showLineEndpoints, showFacesWithNoUnit, showTopologyPrimitives } =
    opts;
  const overlay = buildCrossSectionOverlayStyle(baseURL, {
    selectedLayer: null,
    showLineEndpoints,
    showFacesWithNoUnit,
    showTopologyPrimitives,
    clipToContextBounds: true,
  });

  const mainStyle: mapboxgl.StyleSpecification = {
    version: 8,
    name: "Mapboard cross sections",
    layers: [],
    sources: {},
  };

  let style = mergeStyles(overlay as mapboxgl.StyleSpecification, mainStyle);
  delete style.sprite;
  return style;
}

function buildCrossSectionOverlayStyle(
  baseURL: string,
  options: MapOverlayOptions,
): maplibre.StyleSpecification {
  const { selectedLayer } = options ?? {};

  let sources: Record<string, mapboxgl.SourceSpecification> = {};

  const suffix = getTileQueryParams({
    map_layer: selectedLayer,
    clip: true,
  });

  sources["mapboard"] = {
    type: "vector",
    tiles: [baseURL + `/tile/fills,lines/{z}/{x}/{y}${suffix}`],
    volatile: false,
  };

  let lineColor = [
    "case",
    [
      "in",
      ["get", "type"],
      ["literal", ["thrust-fault", "normal-fault", "fault"]],
    ],
    "#000000",
    ["get", "color"],
  ];

  let lineWidth: any = [
    "case",
    // special case for NNC bounding surface
    ["==", ["get", "source_layer"], 8],
    2,
    // faults and structures
    [
      "in",
      ["get", "type"],
      [
        "literal",
        [
          "thrust-fault",
          "normal-fault",
          "fault",
          "anticline-hinge",
          "syncline-hinge",
        ],
      ],
    ],
    1.2,
    0.5,
  ];

  let lineFilter = [
    "all",
    ["!", ["coalesce", ["get", "covered"], false]],
    ["!=", ["get", "type"], "mapboard:arbitrary"],
  ];

  const lineSymbolFilter = [...lineFilter, ["!=", ["get", "source_layer"], 8]];
  // exclude nappe bounding surface

  let layers = [
    ...buildFillLayers({
      opacity: 1,
      filter: ["has", "unit"],
      source: "mapboard",
    }),

    // A single layer for all lines
    {
      id: "lines",
      type: "line",
      source: "mapboard",
      "source-layer": "lines",
      paint: {
        "line-color": lineColor,
        "line-width": lineWidth,
        "line-opacity": 1,
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
        "line-sort-key": [
          "case",
          [
            "in",
            ["get", "type"],
            ["literal", ["anticline-hinge", "syncline-hinge"]],
          ],
          2,
          [
            "in",
            ["get", "type"],
            ["literal", ["thrust-fault", "normal-fault", "fault"]],
          ],
          1,
          0,
        ],
      },
      filter: lineFilter,
    },
    ...createLineSymbolLayers(lineSymbolFilter),
  ];

  return {
    version: 8,
    sources,
    layers,
  };
}
