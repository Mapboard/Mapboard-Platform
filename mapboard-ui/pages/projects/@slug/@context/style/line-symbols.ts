export interface LineSymbolIndex {
  [key: string]: string;
}

export const lineSymbols = [
  "anticline-hinge",
  "syncline-hinge",
  "left-lateral-fault",
  "right-lateral-fault",
  "normal-fault",
  "reverse-fault",
  "thrust-fault",
];

export function createLineSymbolLayers(filter) {
  let symbolIndex: LineSymbolIndex = {};
  for (const symbol of lineSymbols) {
    symbolIndex[symbol] = `line-symbol:${symbol}`;
  }

  const builder = new SymbolLayerBuilder(symbolIndex, filter);

  return [
    builder.createLayer("fold-axes", {
      types: ["anticline-hinge", "syncline-hinge"],
      symbolSpacing: 200,
    }),
    builder.createLayer("faults", {
      types: [
        "left-lateral-fault",
        "right-lateral-fault",
        "normal-fault",
        "reverse-fault",
      ],
      symbolSpacing: 50,
    }),
    builder.createLayer("thrust-fault", {
      types: ["thrust-fault"],
      symbolSpacing: [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        0, // stop
        3, // size
        15,
        150,
        24,
        300,
      ],
      iconOffset: [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        0,
        ["literal", [0, 0]],
        24,
        ["literal", [0, 0]],
      ],
      filter: ["!=", ["get", "source_layer"], 8], // exclude nappe bounding surface
    }),
  ];
}

class SymbolLayerBuilder {
  index: LineSymbolIndex;
  filter: any;

  constructor(index: LineSymbolIndex, filter: any) {
    this.index = index;
    this.filter = filter;
  }

  createLayer(id: string, opts) {
    const {
      symbolSpacing = 30,
      iconOffset = [0, 0],
      types = Object.keys(this.index),
    } = opts;
    const sz = (s) => s;

    const colorMap = {
      "thrust-fault": "#000000",
      "normal-fault": "#000000",
    };

    return {
      type: "symbol",
      id,
      layout: {
        "icon-image": ["get", ["get", "type"], ["literal", this.index]],
        "icon-pitch-alignment": "map",
        "icon-allow-overlap": true,
        "symbol-avoid-edges": false,
        "symbol-placement": "line",
        "symbol-spacing": symbolSpacing,
        "icon-offset": iconOffset,
        "icon-rotate": 0,
        "icon-size": [
          "interpolate",
          ["exponential", 2],
          ["zoom"],
          0, // stop
          sz(0.3),
          3,
          sz(0.5),
          15,
          sz(1.2), // size
          18,
          sz(4),
          24,
          sz(30),
        ],
      },
      paint: {
        "icon-color": matchStatement("type", colorMap, ["get", "color"]),
      },
      filter: ["all", ["in", ["get", "type"], ["literal", types]], this.filter],
      source: "mapboard",
      "source-layer": "lines",
    };
  }
}

function matchStatement(value, valueMap, defaultVal) {
  return [
    "match",
    ["get", value],
    ...Object.entries(valueMap).reduce((acc, [key, value]) => {
      acc.push(key, value);
      return acc;
    }, []),
    defaultVal,
  ];
}
