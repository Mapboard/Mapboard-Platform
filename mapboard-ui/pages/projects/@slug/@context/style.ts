export function buildMapOverlayStyle(baseURL, selectedLayer = null) {
  let filter: any = ["!=", "map_layer", ""];
  if (selectedLayer != null) {
    filter = ["==", "map_layer", selectedLayer];
  }

  let layerSuffix = "";
  let selectedLayerOpacity = (a, b) => {
    return a;
  };
  if (selectedLayer != null) {
    layerSuffix = "?map_layer=" + selectedLayer;
    selectedLayerOpacity = (a, b) => {
      return ["case", ["==", ["get", "map_layer"], selectedLayer], a, b];
    };
  }

  return {
    version: 8,

    sources: {
      mapboard_polygon: {
        type: "vector",
        tiles: [baseURL + "/polygon/tile/{z}/{x}/{y}" + layerSuffix],
        volatile: true,
      },
      mapboard_line: {
        type: "vector",
        tiles: [baseURL + "/line/tile/{z}/{x}/{y}" + layerSuffix],
        volatile: true,
      },
      mapboard_topology: {
        type: "vector",
        tiles: [baseURL + "/topology/tile/{z}/{x}/{y}" + layerSuffix],
        volatile: true,
      },
    },
    layers: [
      {
        id: "topology",
        type: "fill",
        source: "mapboard_topology",
        "source-layer": "faces",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": selectedLayerOpacity(0.5, 0.3),
        },
        //filter,
      },
      {
        id: "polygons",
        type: "fill",
        source: "mapboard_polygon",
        "source-layer": "polygons",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": selectedLayerOpacity(0.8, 0.4),
        },
        //filter,
      },
      {
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
      },
      {
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
      },
    ],
  };
}
