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

  let lineLayers = [];
  const lineCertaintyFilters = {
    certain: ["==", ["coalesce", ["get", "certainty"], 10], 10],
    high: [">=", ["coalesce", ["get", "certainty"], 10], 8],
    medium: [
      "all",
      [">", ["coalesce", ["get", "certainty"], 10], 5],
      ["<", ["coalesce", ["get", "certainty"], 10], 8],
    ],
    low: ["<=", ["coalesce", ["get", "certainty"], 10], 5],
  };

  const dashPatterns = {
    certain: [1, 0],
    high: [8, 1], // nearly solid
    medium: [4, 1], // dashed
    low: [2, 4], // dotted
  };

  for (const [id, certaintyFilter] of Object.entries(lineCertaintyFilters)) {
    lineLayers.push({
      id: `lines-${id}`,
      type: "line",
      source: "mapboard",
      "source-layer": "lines",
      paint: {
        "line-color": lineColor,
        "line-width": [
          "case",
          // special case for NNC bounding surface
          ["==", ["get", "map_layer"], 413], // nappe complex layer
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
        ],
        "line-opacity": 1,
        // fixed dasharray per layer because this doesn't support data-driven styles
        "line-dasharray": dashPatterns[id],
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
        certaintyFilter,
        ["!", ["coalesce", ["get", "covered"], false]],
        [
          "!",
          [
            "in",
            ["get", "type"],
            [
              "literal",
              ["mapboard:arbitrary", "cross-section", "terrain", "bounds"],
            ],
          ],
        ],
      ],
    });
  }

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
        "fill-opacity": 1,
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
        "fill-opacity": 1,
        "fill-outline-color": "transparent",
      },
      filter: ["all", ["has", "symbol"], fillFilter],
    },
    ...lineLayers,
    // Semi-opaque sky overlay
    {
      id: "sky",
      type: "fill",
      source,
      "source-layer": "fills",
      paint: {
        "fill-color": "#ffffff",
        "fill-opacity": 0.5,
      },
      filter: [
        "all",
        ["==", ["get", "unit"], "sky"],
        [
          "==",
          ["get", "map_layer"],
          2, // context
        ],
      ],
    },
    // Terrain
    {
      id: "terrain",
      type: "line",
      source: "mapboard",
      "source-layer": "lines",
      paint: {
        "line-color": "#000000",
        "line-width": 2,
        "line-offset": -0.5,
        "line-opacity": 1,
      },
      layout: {
        "line-join": "round",
        "line-cap": "butt",
      },
      filter: ["==", ["get", "type"], "terrain"],
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
        "icon-size": 0.2,
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
