import type maplibre from "maplibre-gl";

export function buildCrossSectionStyle(
  baseURL: string,
): maplibre.StyleSpecification {
  let sources: Record<string, mapboxgl.SourceSpecification> = {};

  sources["mapboard"] = {
    type: "vector",
    tiles: [baseURL + `/tile/fills,lines/{z}/{x}/{y}?clip=true`],
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

  const source = "mapboard";
  const fillFilter = ["all", ["has", "unit"], ["==", ["get", "map_layer"], 1]];

  let layers = [
    {
      id: "basement",
      type: "fill",
      source,
      "source-layer": "fills",
      paint: {
        "fill-color": "#ffeeee",
      },
      filter: ["all", fillFilter, ["==", ["get", "unit"], "basement"]],
    },
    {
      id: "fills-without-symbols",
      type: "fill",
      source,
      "source-layer": "fills",
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": 0.8,
        "fill-outline-color": "transparent",
      },
      filter: [
        "all",
        ["!", ["has", "symbol"]],
        ["!=", ["get", "unit"], "basement"],
        fillFilter,
      ],
    },
    {
      id: "fills-with-symbols",
      type: "fill",
      source,
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
        "fill-opacity": 0.8,
        "fill-outline-color": "transparent",
      },
      filter: ["all", ["has", "symbol"], fillFilter],
    },

    // A single layer for all lines
    {
      id: "lines",
      type: "line",
      source: "mapboard",
      "source-layer": "lines",
      paint: {
        "line-color": lineColor,
        "line-width": [
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
          1,
          0.5,
        ],
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
      filter: [
        "all",
        ["!", ["coalesce", ["get", "covered"], false]],
        ["!=", ["get", "type"], "mapboard:arbitrary"],
      ],
    },
    {
      type: "symbol",
      id: "thrust-fault-symbols",
      layout: {
        "icon-image": "cross-section:thrust-fault-movement",
        "icon-pitch-alignment": "map",
        "icon-allow-overlap": true,
        "symbol-avoid-edges": false,
        "symbol-placement": "line",
        "symbol-spacing": 50,
        "icon-offset": [0, -15],
        "icon-rotate": 0,
        "icon-size": 0.15,
      },
      filter: ["all", ["==", ["get", "type"], "thrust-fault"]],
      source: "mapboard",
      "source-layer": "lines",
    },
  ];

  return {
    version: 8,
    name: "Mapboard cross sections",
    sources,
    layers,
  };
}
