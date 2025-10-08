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
      //"text-ignore-placement": true,
      "icon-allow-overlap": showAll,
      "icon-ignore-placement": showAll,
    },
    paint: {
      "text-halo-color": "rgba(255,255,255, 0.5)",
      "text-halo-width": 1,
      "text-halo-blur": 1,
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
      ["any", ["get", "fold_axis"], ["get", "lineation"]],
      ["get", "trend"],
      ["has", "strike"],
      ["get", "strike"],
      0,
    ],

    // Output
    [
      "case",
      // Symbol rotation between 60-120 or 240-300
      [
        "any",
        [">=", ["var", "rotation"], 315],
        ["<=", ["var", "rotation"], 45],
      ],
      "left",
      [">=", ["var", "rotation"], 225],
      "bottom",
      [">=", ["var", "rotation"], 135],
      "right",
      "top",
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
    "text-anchor": labelOffset,
    "text-radial-offset": 0.8,
    "icon-image": iconImage,
    "icon-rotate": ["coalesce", ["get", "strike"], ["get", "trend"], 0],
    "icon-rotation-alignment": "map",
    "icon-size": 0.15,
    "symbol-spacing": 1,
    "text-font": ["PT Serif Regular"],
    "text-size": 12,
    "text-justify": "auto",
    "text-field": [
      "to-string",
      [
        "round",
        [
          "case",
          ["any", ["get", "fold_axis"], ["get", "lineation"]],
          ["get", "plunge"],
          ["get", "dip"],
        ],
      ],
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
