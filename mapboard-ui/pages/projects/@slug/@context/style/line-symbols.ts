export interface LineSymbolIndex {
  [key: string]: string;
}

function createLineSymbolLayers(symbolIndex: LineSymbolIndex, filter) {
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
      symbolSpacing: 30,
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
      filters = null,
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
      filter: [
        "all",
        ["in", ["get", "type"], ["literal", types]],
        ...(filters ?? []),
      ],
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

export { createLineSymbolLayers };
