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

export function createLineSymbolLayers(filter, scaleFactor = 1.0) {
  let symbolIndex: LineSymbolIndex = {};
  for (const symbol of lineSymbols) {
    symbolIndex[symbol] = `line-symbol:${symbol}`;
  }

  const builder = new SymbolLayerBuilder(symbolIndex, filter);

  return [
    builder.createLayer("fold-axes", {
      types: ["anticline-hinge", "syncline-hinge"],
      symbolSpacing: 200 * scaleFactor,
      symbolPlacement: "line",
      iconScaleFactor: 1.5 * scaleFactor,
    }),
    builder.createLayer("faults", {
      types: ["left-lateral-fault", "right-lateral-fault", "normal-fault"],
      symbolSpacing: 100 * scaleFactor,
      iconScaleFactor: scaleFactor,
    }),
    builder.createLayer("thrust-fault", {
      types: ["thrust-fault", "reverse-fault"],
      symbolSpacing: [
        "interpolate",
        ["exponential", 2],
        ["zoom"],
        0, // stop
        3 * scaleFactor, // size
        15,
        80 * scaleFactor,
        24,
        140 * scaleFactor,
      ],
      iconOffset: [0, 0],
      iconScaleFactor: scaleFactor,
    }),
  ];
}

export const structureColor = "#7c0138";

class SymbolLayerBuilder {
  index: LineSymbolIndex;
  filter: any;

  constructor(index: LineSymbolIndex, filter: any = null) {
    this.index = index;
    this.filter = filter;
  }

  createLayer(id: string, opts) {
    const {
      symbolSpacing = 30,
      symbolPlacement = "line",
      iconOffset = [0, 0],
      iconScaleFactor = 1.0,
      types = Object.keys(this.index),
    } = opts;
    const sz = (s) => s * iconScaleFactor;

    const colorMap = {
      "thrust-fault": "#000000",
      "normal-fault": "#000000",
      "anticline-hinge": structureColor,
      "syncline-hinge": structureColor,
    };

    let filterStack = ["all", ["in", ["get", "type"], ["literal", types]]];
    if (this.filter != null) {
      filterStack.push(this.filter);
    }
    if (opts.filter != null) {
      filterStack.push(opts.filter);
    }

    return {
      type: "symbol",
      id,
      layout: {
        "icon-image": ["get", ["get", "type"], ["literal", this.index]],
        "icon-pitch-alignment": "map",
        "icon-allow-overlap": true,
        "symbol-avoid-edges": false,
        "symbol-placement": symbolPlacement,
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
      filter: filterStack,
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
