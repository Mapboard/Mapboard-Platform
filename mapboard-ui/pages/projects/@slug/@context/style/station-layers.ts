import { LayerSpecification } from "mapbox-gl";

export interface StationLayersOptions {
  showLabels?: boolean;
  showOrientations?: boolean;
  showAll?: boolean;
  sourceID: string;
  color?: string;
  id?: string;
}

export function createStationsLayer(
  opts: StationLayersOptions,
): LayerSpecification {
  const baseLayout = pointLayoutProperties(opts.showLabels);
  const showAll = opts.showAll ?? false;

  const id = opts.id ?? "stations";
  if (!opts.showOrientations) {
    return {
      id,
      type: "circle",
      source: opts.sourceID,
      paint: {
        "circle-color": opts.color ?? "dodgerblue",
        "circle-stroke-color": "white",
        "circle-stroke-width": 1,
        "circle-radius": 4,
      },
    };
  }

  return {
    id,
    type: "symbol",
    source: opts.sourceID,
    layout: {
      ...baseLayout,
      // Stack symbols at the same location
      "text-ignore-placement": showAll,
      "icon-allow-overlap": showAll,
      "icon-ignore-placement": showAll,
    },
  };
}

export function pointLayoutProperties(showLabels: boolean = false) {
  // Get the rotation of the symbol, either strike, trend or failing both, 0
  // Get the label offset, which is further to the right if the symbol rotation is between 60-120 or 240-300
  const labelOffset = [
    "let",
    "rotation",
    [
      "case",
      ["has", "strike"],
      ["get", "strike"],
      ["has", "trend"],
      ["get", "trend"],
      0,
    ],

    // Output
    [
      "case",
      // Symbol rotation between 60-120 or 240-300
      [
        "any",
        [
          "all",
          [">=", ["var", "rotation"], 60],
          ["<=", ["var", "rotation"], 120],
        ],
        [
          "all",
          [">=", ["var", "rotation"], 240],
          ["<=", ["var", "rotation"], 300],
        ],
      ],
      ["literal", [2, 0]], // Need to specifiy 'literal' to return an array in expressions
      // Default
      ["literal", [0.75, 0]],
    ],
  ];

  const iconImage = [
    "case",
    ["get", "lineation"],
    "point:lineation_general",
    ["get", "fold_axis"],
    "point:fold_axis",
    ["get", "bedding"],
    [
      "case",
      ["get", "overturned"],
      "point:bedding_overturned",
      ["get", "vertical"],
      "point:bedding_vertical",
      ["get", "horizontal"],
      "point:bedding_horizontal",
      ["get", "bedding"],
      "point:bedding_inclined",
      "point:bedding_inclined",
    ],
    ["get", "cleavage"],
    [
      "case",
      ["get", "vertical"],
      "point:foliation_vertical",
      ["get", "horizontal"],
      "point:foliation_horizontal",
      "point:foliation_inclined",
    ],
    "point:point",
  ];
  return {
    "text-anchor": "left",
    "text-offset": labelOffset,
    "icon-image": iconImage,
    "icon-rotate": ["coalesce", ["get", "strike"], ["get", "trend"], 0],
    "icon-rotation-alignment": "map",
    "icon-size": 0.2,
    // "symbol-spacing": 1,
    "icon-padding": 0,
    "text-field": [
      "case",
      ["any", ["get", "vertical"], ["get", "horizontal"]],
      "",
      ["any", ["has", "dip"], ["has", "plunge"]],
      [
        "to-string",
        [
          "round",
          ["number", ["coalesce", ["get", "dip"], ["get", "plunge"], 0]],
        ],
      ],
      "",
    ],
    "symbol-sort-key": [
      "case",
      ["get", "fold_axis"],
      0,
      ["get", "lineation"],
      1,
      ["get", "bedding"],
      2,
      ["get", "cleavage"],
      3,
      4,
    ],

    //"text-field": isShowSpotLabelsOn ? getPointLabel() : "",
    // "symbol-spacing": 1,
    //"icon-padding": 0,
  };
}

/**
 * Symbol IDs:
 * bedding_horizontal
 * bedding_inclined
 * bedding_overturned
 * bedding_vertical
 * contact_inclined
 * contact_vertical
 * fault
 * foliation_horizontal
 * foliation_inclined
 * foliation_vertical
 * fracture
 * lineation_general
 * point
 * shear_zone_inclined
 * shear_zone_vertical
 */
